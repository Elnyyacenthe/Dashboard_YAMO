"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const schema = z.object({
  recipientName: z.string().trim().min(2).max(80),
  mtnNumber: z.string().trim().max(20).optional().default(""),
  orangeNumber: z.string().trim().max(20).optional().default(""),
  instructions: z.string().trim().max(500).optional().default(""),
  verificationTelegramLink: z.string().trim().max(200).optional().default(""),
});

type ManualPaymentSettingsInput = z.infer<typeof schema>;

const KEYS: Record<keyof ManualPaymentSettingsInput, string> = {
  recipientName: "payment.manual.recipientName",
  mtnNumber: "payment.manual.mtnNumber",
  orangeNumber: "payment.manual.orangeNumber",
  instructions: "payment.manual.instructions",
  verificationTelegramLink: "verification.telegramLink",
};

const LABELS: Record<keyof ManualPaymentSettingsInput, string> = {
  recipientName: "Nom du titulaire Mobile Money",
  mtnNumber: "Numéro MTN Mobile Money",
  orangeNumber: "Numéro Orange Money",
  instructions: "Instructions complémentaires",
  verificationTelegramLink: "Lien Telegram — vérification d'identité",
};

/** Met à jour les coordonnées Mobile Money affichées aux escortes pour le paiement manuel. Réservé ADMIN. */
export async function updateManualPaymentSettingsAction(
  input: ManualPaymentSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Réservé aux administrateurs" };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Formulaire invalide" };

  const entries = Object.entries(KEYS) as [keyof ManualPaymentSettingsInput, string][];
  await prisma.$transaction(
    entries.map(([field, key]) =>
      prisma.siteSetting.upsert({
        where: { key },
        update: { value: parsed.data[field] },
        create: {
          key,
          value: parsed.data[field],
          category: field === "verificationTelegramLink" ? "verification" : "manual_payment",
          label: LABELS[field],
        },
      }),
    ),
  );

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "MANUAL_PAYMENT_SETTINGS_UPDATED",
      entity: "SiteSetting",
      metadata: parsed.data,
    },
  });

  revalidatePath("/admin/reglages");
  return { ok: true };
}
