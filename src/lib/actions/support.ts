"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { TicketStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { rateLimit } from "@/lib/rate-limit";

const messageSchema = z
  .object({
    body: z.string().trim().max(3000).optional().default(""),
    attachmentUrl: z.string().url().optional(),
    attachmentName: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.body.length > 0 || !!d.attachmentUrl, { message: "Message vide" });

// =====================================================================
// USER — un seul fil de discussion par utilisateur avec le support, pas de
// notion de ticket/catégorie côté user : juste "écrire au support".
//
// Ouvert aux ESCORT et CLIENT : c'est le seul canal permettant à un client
// de se plaindre ou de signaler un problème auprès de la plateforme.
// =====================================================================

/** Envoie un message dans le fil de discussion unique de l'utilisateur connecté. */
export async function sendSupportMessageAction(input: unknown): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié" };
  if (session.user.role !== "ESCORT" && session.user.role !== "CLIENT") {
    return { ok: false, error: "Non autorisé" };
  }

  const rl = await rateLimit(`support-msg:${session.user.id}`, { limit: 20, windowMs: 10 * 60_000 });
  if (!rl.success) return { ok: false, error: "Trop de messages envoyés, réessayez dans un instant." };

  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Message vide ou trop long" };

  const existing = await prisma.supportTicket.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const ticketId = existing
    ? existing.id
    : (
        await prisma.supportTicket.create({
          data: { userId: session.user.id, subject: "Discussion", category: "GENERAL", status: "OPEN" },
          select: { id: true },
        })
      ).id;

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId,
        authorId: session.user.id,
        body: parsed.data.body,
        isAdmin: false,
        attachmentUrl: parsed.data.attachmentUrl,
        attachmentName: parsed.data.attachmentName,
      },
    }),
    // Réouvre automatiquement si l'admin avait clos la discussion — l'utilisateur
    // doit toujours pouvoir écrire, pas de "ticket fermé" bloquant côté user.
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: "OPEN", updatedAt: new Date() },
    }),
  ]);

  // Notif aux admins (1 seul ping, pas à chaque message pour ne pas spammer)
  const firstAdmin = await prisma.user.findFirst({
    where: { role: { in: ["ADMIN", "MODERATOR"] } },
    select: { id: true },
  });
  if (firstAdmin) {
    await prisma.notification.create({
      data: {
        userId: firstAdmin.id,
        title: "Nouveau message support",
        body: `${session.user.name ?? session.user.email ?? "Un utilisateur"} a écrit au service client.`,
        link: `/admin/support/${ticketId}`,
      },
    });
  }

  revalidatePath("/escort/support");
  revalidatePath("/client/support");
  return { ok: true };
}

const reportSchema = z.object({
  adTitle: z.string().trim().min(1).max(200),
  adUrl: z.string().url(),
});

const REPORT_FOLLOWUP =
  "Merci pour votre signalement. Pouvez-vous nous fournir des preuves (captures d'écran, photos, " +
  "documents) pour appuyer votre déclaration ? Vous pouvez les joindre directement ici avec le trombone.";

/**
 * Signalement d'annonce : envoie directement le message dans le fil support
 * (plus de brouillon à valider) puis une relance automatique demandant des
 * preuves — reproduit le comportement historique où signaler ouvrait tout de
 * suite une discussion avec le support.
 */
export async function submitAdReportAction(input: unknown): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié" };
  if (session.user.role !== "ESCORT" && session.user.role !== "CLIENT") {
    return { ok: false, error: "Non autorisé" };
  }

  const rl = await rateLimit(`report-ad:${session.user.id}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!rl.success) return { ok: false, error: "Trop de signalements. Réessayez plus tard." };

  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Requête invalide" };

  const existing = await prisma.supportTicket.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const ticketId = existing
    ? existing.id
    : (
        await prisma.supportTicket.create({
          data: { userId: session.user.id, subject: "Discussion", category: "GENERAL", status: "OPEN" },
          select: { id: true },
        })
      ).id;

  const firstAdmin = await prisma.user.findFirst({
    where: { role: { in: ["ADMIN", "MODERATOR"] } },
    select: { id: true },
  });

  const reportBody = `Je souhaite signaler l'annonce « ${parsed.data.adTitle} » (${parsed.data.adUrl}).`;

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: { ticketId, authorId: session.user.id, body: reportBody, isAdmin: false },
    }),
    ...(firstAdmin
      ? [
          prisma.supportMessage.create({
            data: { ticketId, authorId: firstAdmin.id, body: REPORT_FOLLOWUP, isAdmin: true },
          }),
        ]
      : []),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: "WAITING_USER", updatedAt: new Date() },
    }),
  ]);

  if (firstAdmin) {
    await prisma.notification.create({
      data: {
        userId: firstAdmin.id,
        title: "Nouveau signalement",
        body: `${session.user.name ?? "Un utilisateur"} a signalé : ${parsed.data.adTitle}`,
        link: `/admin/support/${ticketId}`,
      },
    });
  }

  revalidatePath("/escort/support");
  revalidatePath("/client/support");
  return { ok: true };
}

// =====================================================================
// ADMIN
// =====================================================================

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR")) {
    throw new Error("Non autorisé");
  }
  return session.user;
}

const replyTicketSchema = z
  .object({
    ticketId: z.string().cuid(),
    body: z.string().trim().max(3000).optional().default(""),
    attachmentUrl: z.string().url().optional(),
    attachmentName: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.body.length > 0 || !!d.attachmentUrl, { message: "Message vide" });

/** Réponse de l'admin/modo sur un fil de discussion. */
export async function adminReplyTicketAction(input: unknown): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const admin = await requireAdmin();
  const parsed = replyTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Champs invalides" };

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: parsed.data.ticketId },
    select: { id: true, userId: true, user: { select: { role: true } } },
  });
  if (!ticket) return { ok: false, error: "Ticket introuvable" };

  const destination = ticket.user.role === "ESCORT" ? "/escort/support" : "/client/support";

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: admin.id,
        body: parsed.data.body,
        isAdmin: true,
        attachmentUrl: parsed.data.attachmentUrl,
        attachmentName: parsed.data.attachmentName,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "WAITING_USER", updatedAt: new Date() },
    }),
    prisma.notification.create({
      data: {
        userId: ticket.userId,
        title: "Réponse du support",
        body: "L'équipe Affinité a répondu à votre message.",
        link: destination,
      },
    }),
  ]);

  revalidatePath(`/admin/support/${ticket.id}`);
  revalidatePath("/admin/support");
  return { ok: true };
}

/** Modification du statut par l'admin — triage interne, n'empêche jamais l'utilisateur d'écrire. */
export async function setTicketStatusAction(ticketId: string, status: TicketStatus): Promise<void> {
  await requireAdmin();
  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status },
  });
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${ticketId}`);
}

const DISMISS_MESSAGE =
  "Signalement examiné par notre équipe — aucune suite à donner pour le moment. " +
  "N'hésitez pas à nous recontacter si la situation évolue.";

/** Ignorer un signalement : clôt la conversation avec une note automatique au client. */
export async function dismissTicketAction(ticketId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const admin = await requireAdmin();
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, userId: true, user: { select: { role: true } } },
  });
  if (!ticket) return { ok: false, error: "Conversation introuvable" };

  const destination = ticket.user.role === "ESCORT" ? "/escort/support" : "/client/support";

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: { ticketId: ticket.id, authorId: admin.id, body: DISMISS_MESSAGE, isAdmin: true },
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "CLOSED", updatedAt: new Date() },
    }),
    prisma.notification.create({
      data: {
        userId: ticket.userId,
        title: "Signalement traité",
        body: DISMISS_MESSAGE,
        link: destination,
      },
    }),
  ]);

  revalidatePath(`/admin/support/${ticket.id}`);
  revalidatePath("/admin/support");
  return { ok: true };
}
