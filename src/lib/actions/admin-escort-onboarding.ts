"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { getEscortSubscriptionPricing } from "@/lib/escort-subscription";

const createSchema = z
  .object({
    name: z.string().trim().min(2).max(50),
    email: z.string().email(),
    phone: z.string().trim().min(8).max(20),
    password: z.string().min(8).max(50),
    tier: z.enum(["STANDARD", "PREMIUM", "VIP"]),
    months: z.coerce.number().int().min(1).max(12),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.tier !== "STANDARD" || data.months === 1, {
    message: "Le tier Standard est une période fixe d'une semaine (1 seule unité)",
    path: ["months"],
  });

export type AdminOnboardResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * Crée un compte ESCORT + active son abonnement manuellement (paiement cash IRL).
 * Réservé ADMIN. Trace dans AuditLog.
 */
export async function adminCreateEscortAction(
  _prev: AdminOnboardResult | null,
  formData: FormData,
): Promise<AdminOnboardResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Réservé aux administrateurs" };
  }

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    tier: formData.get("tier"),
    months: formData.get("months"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Formulaire invalide" };
  }
  const data = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: data.email }, { phone: data.phone }] },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "Un compte avec cet email ou ce téléphone existe déjà" };
  }

  const pricing = await getEscortSubscriptionPricing(data.tier);
  const totalDays = pricing.days * data.months;
  const until = new Date(Date.now() + totalDays * 86_400_000);

  const hashed = await bcrypt.hash(data.password, 10);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: hashed,
        role: "ESCORT",
        emailVerified: new Date(),
        phoneVerified: new Date(),
        escortSubscriptionTier: data.tier,
        escortSubscriptionUntil: until,
      },
    });
    await tx.escortProfile.create({
      data: {
        userId: user.id,
        displayName: data.name,
        slug: `${slugify(data.name)}-${Date.now().toString(36)}`,
        gender: "FEMALE",
        age: 21, // âge par défaut, l'escorte modifie sur son profil
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: session.user.id,
        action: "ADMIN_ESCORT_ONBOARDING",
        entity: "User",
        entityId: user.id,
        metadata: {
          tier: data.tier,
          months: data.months,
          until: until.toISOString(),
          notes: data.notes,
        },
      },
    });
    await tx.notification.create({
      data: {
        userId: user.id,
        title: "Bienvenue sur Affinité 🎉",
        body: `Votre compte a été créé par l'équipe Affinité avec un abonnement ${data.tier} actif jusqu'au ${until.toLocaleDateString("fr-FR")}. Connectez-vous pour publier votre première annonce.`,
        link: "/escort/dashboard",
      },
    });
    return user;
  });

  revalidatePath("/admin/utilisateurs");
  return { ok: true, userId: created.id };
}

/**
 * Active manuellement (ou prolonge) l'abonnement d'un user ESCORT existant
 * sans passer par K-Pay (paiement cash IRL).
 */
export async function adminActivateSubscriptionAction(input: {
  userId: string;
  tier: "STANDARD" | "PREMIUM" | "VIP";
  months: number;
  notes?: string;
}): Promise<{ ok: true; until: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Réservé aux administrateurs" };
  }
  if (input.months < 1 || input.months > 12) {
    return { ok: false, error: "Durée invalide (1-12 mois)" };
  }
  if (input.tier === "STANDARD" && input.months !== 1) {
    return { ok: false, error: "Le tier Standard est une période fixe d'une semaine (1 seule unité)" };
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, escortSubscriptionUntil: true },
  });
  if (!user) return { ok: false, error: "Utilisateur introuvable" };

  const pricing = await getEscortSubscriptionPricing(input.tier);
  const days = pricing.days * input.months;
  const now = new Date();
  const base = user.escortSubscriptionUntil && user.escortSubscriptionUntil > now
    ? user.escortSubscriptionUntil
    : now;
  const until = new Date(base.getTime() + days * 86_400_000);

  await prisma.user.update({
    where: { id: input.userId },
    data: {
      escortSubscriptionTier: input.tier,
      escortSubscriptionUntil: until,
      ...(user.role === "CLIENT" && { role: "ESCORT" }),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "ADMIN_SUBSCRIPTION_GRANTED",
      entity: "User",
      entityId: input.userId,
      metadata: { tier: input.tier, months: input.months, until: until.toISOString(), notes: input.notes },
    },
  });

  await prisma.notification.create({
    data: {
      userId: input.userId,
      title: "Abonnement activé par l'équipe ✨",
      body: `L'équipe Affinité a activé votre abonnement ${input.tier} jusqu'au ${until.toLocaleDateString("fr-FR")}.`,
      link: "/escort/abonnement",
    },
  });

  revalidatePath("/admin/utilisateurs");
  return { ok: true, until: until.toISOString() };
}
