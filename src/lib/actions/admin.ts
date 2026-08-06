"use server";

import { revalidatePath } from "next/cache";
import type { AdStatus, AdTier, ReportStatus, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { applyIntent } from "@/lib/kpay-direct";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR")) {
    throw new Error("Non autorisé");
  }
  return session.user;
}

/** Approuve une annonce en modération. */
export async function approveAdAction(adId: string) {
  const admin = await requireAdmin();
  await prisma.$transaction([
    prisma.ad.update({
      where: { id: adId },
      data: {
        status: "ACTIVE",
        publishedAt: new Date(),
        rejectionReason: null,
        media: { updateMany: { where: { adId }, data: { isApproved: true } } },
      },
    }),
    prisma.auditLog.create({
      data: { actorId: admin.id, action: "AD_APPROVED", entity: "Ad", entityId: adId },
    }),
  ]);
  revalidatePath("/admin/moderation");
  revalidatePath("/");
}

export async function rejectAdAction(adId: string, reason: string) {
  const admin = await requireAdmin();
  await prisma.$transaction([
    prisma.ad.update({
      where: { id: adId },
      data: { status: "REJECTED", rejectionReason: reason },
    }),
    prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "AD_REJECTED",
        entity: "Ad",
        entityId: adId,
        metadata: { reason },
      },
    }),
  ]);
  revalidatePath("/admin/moderation");
}

export async function banAdAction(adId: string, reason: string) {
  const admin = await requireAdmin();
  await prisma.$transaction([
    prisma.ad.update({ where: { id: adId }, data: { status: "BANNED", rejectionReason: reason } }),
    prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "AD_BANNED",
        entity: "Ad",
        entityId: adId,
        metadata: { reason },
      },
    }),
  ]);
  revalidatePath("/admin/annonces");
}

export async function setAdTierAction(adId: string, tier: AdTier, days: number = 30) {
  await requireAdmin();
  const promotedUntil = new Date(Date.now() + days * 86_400_000);
  await prisma.ad.update({
    where: { id: adId },
    data: {
      tier,
      promotedUntil: tier === "STANDARD" ? null : promotedUntil,
    },
  });
  revalidatePath("/admin/annonces");
}

/** Bannit ou débannit un utilisateur. */
export async function toggleUserBanAction(userId: string, reason?: string) {
  const admin = await requireAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Utilisateur introuvable");
  const next = !user.isBanned;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { isBanned: next, banReason: next ? reason ?? null : null },
    }),
    next
      ? prisma.ad.updateMany({
          where: { ownerId: userId, status: { in: ["ACTIVE", "PENDING"] } },
          data: { status: "BANNED" },
        })
      : prisma.ad.updateMany({
          where: { ownerId: userId, status: "BANNED" },
          data: { status: "PAUSED" },
        }),
    prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: next ? "USER_BANNED" : "USER_UNBANNED",
        entity: "User",
        entityId: userId,
        metadata: { reason },
      },
    }),
  ]);
  revalidatePath("/admin/utilisateurs");
}

export async function setUserRoleAction(userId: string, role: Role) {
  const admin = await requireAdmin();
  if (admin.role !== "ADMIN") throw new Error("Réservé aux admins");
  await prisma.user.update({ where: { id: userId }, data: { role } });
  await prisma.auditLog.create({
    data: { actorId: admin.id, action: "USER_ROLE_CHANGED", entity: "User", entityId: userId, metadata: { role } },
  });
  revalidatePath("/admin/utilisateurs");
}

export async function setProfileVerifiedAction(profileId: string, verified: boolean) {
  const admin = await requireAdmin();
  const profile = await prisma.escortProfile.update({
    where: { id: profileId },
    data: {
      isVerified: verified,
      verification: verified ? "VERIFIED" : "REJECTED",
      verifiedAt: verified ? new Date() : null,
    },
    select: { userId: true },
  });

  // Synchronise la demande de vérification en attente (documents envoyés sur
  // Telegram) avec la décision admin, pour que /escort/verification reflète le bon statut.
  const pendingVerif = await prisma.idVerification.findFirst({
    where: { userId: profile.userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (pendingVerif) {
    await prisma.idVerification.update({
      where: { id: pendingVerif.id },
      data: {
        status: verified ? "VERIFIED" : "REJECTED",
        rejectionReason: verified ? null : "Documents non validés (revue Telegram)",
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });
  }

  await prisma.notification.create({
    data: {
      userId: profile.userId,
      title: verified ? "Profil vérifié ✅" : "Vérification retirée",
      body: verified
        ? "Vos documents ont été validés. Le badge Vérifié s'affiche désormais sur vos annonces."
        : "Votre statut de vérification a été retiré ou refusé. Contactez le service client pour plus d'informations.",
      link: verified ? "/escort/profil" : "/escort/verification",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: verified ? "PROFILE_VERIFIED" : "PROFILE_UNVERIFIED",
      entity: "EscortProfile",
      entityId: profileId,
    },
  });
  revalidatePath("/admin/utilisateurs");
}

/** Modération photos — approuver / refuser une photo individuelle. */
export async function approveMediaAction(mediaId: string) {
  await requireAdmin();
  await prisma.media.update({
    where: { id: mediaId },
    data: { isApproved: true, rejectionReason: null },
  });
  revalidatePath("/admin/moderation");
}

export async function rejectMediaAction(mediaId: string, reason: string) {
  await requireAdmin();
  await prisma.media.update({
    where: { id: mediaId },
    data: { isApproved: false, rejectionReason: reason },
  });
  revalidatePath("/admin/moderation");
}

/** Résoudre / rejeter un signalement. */
export async function resolveReportAction(
  reportId: string,
  status: Extract<ReportStatus, "RESOLVED" | "DISMISSED">,
  resolution?: string,
) {
  const admin = await requireAdmin();
  await prisma.report.update({
    where: { id: reportId },
    data: { status, resolution, resolvedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: `REPORT_${status}`,
      entity: "Report",
      entityId: reportId,
      metadata: { resolution },
    },
  });
  revalidatePath("/admin/signalements");
}

/**
 * Validation manuelle d'un paiement (K-Pay indisponible ou déclaration
 * manuelle escorte via Mobile Money direct).
 *
 * Si le paiement porte un `intent` (BUMP, ESCORT_SUBSCRIPTION, etc.), on
 * délègue à `applyIntent` qui applique l'action métier correspondante de
 * façon idempotente. Sinon on retombe sur l'ancien chemin legacy adId+tier.
 */
export async function markPaymentPaidAction(paymentId: string) {
  const admin = await requireAdmin();
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error("Paiement introuvable");
  if (payment.status === "FAILED") throw new Error("Ce paiement a été refusé, impossible de le valider");

  if (payment.intent) {
    await applyIntent(paymentId);
  } else if (payment.status !== "PAID") {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: paymentId },
        data: { status: "PAID", paidAt: new Date() },
      }),
      ...(payment.adId && payment.tier
        ? [
            prisma.ad.update({
              where: { id: payment.adId },
              data: {
                tier: payment.tier,
                promotedUntil: new Date(
                  Date.now() + (payment.durationDays ?? 30) * 86_400_000,
                ),
              },
            }),
          ]
        : []),
    ]);
  }

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "PAYMENT_MARKED_PAID",
      entity: "Payment",
      entityId: paymentId,
    },
  });
  revalidatePath("/admin/paiements");
}

/** Refuse une déclaration de paiement (ex : référence introuvable côté Mobile Money). */
export async function rejectPaymentAction(paymentId: string, reason: string) {
  const admin = await requireAdmin();
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error("Paiement introuvable");
  if (payment.intentApplied) throw new Error("Ce paiement a déjà été appliqué, impossible de le refuser");

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "FAILED",
        metadata: {
          ...((payment.metadata as Record<string, unknown> | null) ?? {}),
          rejectionReason: reason,
        },
      },
    }),
    prisma.notification.create({
      data: {
        userId: payment.userId,
        title: "Paiement refusé",
        body: `Votre déclaration de paiement de ${payment.amount} FCFA a été refusée. Motif : ${reason}`,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "PAYMENT_REJECTED",
        entity: "Payment",
        entityId: paymentId,
        metadata: { reason },
      },
    }),
  ]);
  revalidatePath("/admin/paiements");
}
