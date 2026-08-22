"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { FREE_TRIAL_KEYS } from "@/lib/escort-subscription";

const schema = z.object({
  /** Interrupteur maître : à false, plus aucune nouvelle escorte ne reçoit d'essai. */
  enabled: z.boolean(),
  days: z.coerce.number().int().min(1).max(365),
  tier: z.enum(["STANDARD", "PREMIUM", "VIP"]),
});

export type FreeTrialSettingsInput = z.infer<typeof schema>;

const LABELS: Record<keyof FreeTrialSettingsInput, string> = {
  enabled: "Essai gratuit nouvelles escortes (activé)",
  days: "Durée de l'essai gratuit (jours)",
  tier: "Tier offert pendant l'essai",
};

/**
 * Met à jour l'offre d'essai gratuit des nouvelles escortes. Réservé ADMIN.
 *
 * Désactiver l'essai n'affecte PAS les essais déjà en cours (les escortes
 * gardent la période offerte jusqu'à son terme) : seules les inscriptions
 * suivantes redeviennent payantes immédiatement.
 */
export async function updateFreeTrialSettingsAction(
  input: FreeTrialSettingsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Réservé aux administrateurs" };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Valeurs invalides (durée entre 1 et 365 jours)" };
  }

  const values: Record<keyof FreeTrialSettingsInput, string> = {
    enabled: parsed.data.enabled ? "true" : "false",
    days: String(parsed.data.days),
    tier: parsed.data.tier,
  };

  await prisma.$transaction(
    (Object.keys(values) as (keyof FreeTrialSettingsInput)[]).map((field) =>
      prisma.siteSetting.upsert({
        where: { key: FREE_TRIAL_KEYS[field] },
        update: { value: values[field] },
        create: {
          key: FREE_TRIAL_KEYS[field],
          value: values[field],
          category: "free_trial",
          label: LABELS[field],
        },
      }),
    ),
  );

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "FREE_TRIAL_SETTINGS_UPDATED",
      entity: "SiteSetting",
      metadata: parsed.data,
    },
  });

  revalidatePath("/admin/reglages");
  revalidatePath("/admin/tarifs");
  return { ok: true };
}
