import { prisma } from "@/lib/prisma";
import { getSettingNumber } from "@/lib/settings";
import type { EscortSubscriptionTier, Prisma } from "@prisma/client";

/** Client Prisma ou client de transaction — permet d'appeler ces helpers dans un $transaction. */
type Db = typeof prisma | Prisma.TransactionClient;

/** Tier réellement souscriptible (NONE = pas d'abonnement). */
export type PaidTier = Exclude<EscortSubscriptionTier, "NONE">;

export interface EscortSubStatus {
  tier: EscortSubscriptionTier;
  isActive: boolean;
  until: Date | null;
  daysLeft: number;
  caps: { ads: number; photos: number };
  autoRenew: boolean;
  /** L'abonnement actif est l'essai gratuit offert à l'inscription (v21). */
  isTrial: boolean;
  /** Fin de l'essai gratuit. Non nul = essai déjà consommé (même expiré). */
  trialEndsAt: Date | null;
}

/** Lit l'état d'abonnement d'un user (escort). */
export async function getEscortSubscriptionStatus(userId: string): Promise<EscortSubStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      escortSubscriptionTier: true,
      escortSubscriptionUntil: true,
      escortSubscriptionAutoRenew: true,
      escortTrialEndsAt: true,
    },
  });

  const now = new Date();
  const tier = user?.escortSubscriptionTier ?? "NONE";
  const until = user?.escortSubscriptionUntil ?? null;
  const isActive = !!until && until > now && tier !== "NONE";
  const daysLeft = until ? Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 86_400_000)) : 0;
  const trialEndsAt = user?.escortTrialEndsAt ?? null;

  const caps = isActive ? await getCapsForTier(tier) : { ads: 0, photos: 0 };

  return {
    tier,
    isActive,
    until,
    daysLeft,
    caps,
    autoRenew: user?.escortSubscriptionAutoRenew ?? false,
    // Dès que l'escorte paie, `until` est repoussé au-delà de la fin d'essai
    // → l'abonnement n'est plus considéré comme un essai.
    isTrial: isActive && !!trialEndsAt && until! <= trialEndsAt,
    trialEndsAt,
  };
}

/** Caps photos + annonces pour un tier d'abonnement. */
export async function getCapsForTier(
  tier: EscortSubscriptionTier,
): Promise<{ ads: number; photos: number }> {
  if (tier === "NONE") return { ads: 0, photos: 0 };
  const tierKey = tier.toLowerCase();
  const [ads, photos] = await Promise.all([
    getSettingNumber(`escortSubscription.cap.${tierKey}.ads`, tier === "VIP" ? 999 : tier === "PREMIUM" ? 3 : 1),
    getSettingNumber(`escortSubscription.cap.${tierKey}.photos`, tier === "VIP" ? 50 : tier === "PREMIUM" ? 10 : 3),
  ]);
  return { ads, photos };
}

export interface EscortSubPricing {
  /** Prix pour une période (voir `days`). */
  amount: number;
  /** Durée en jours d'une période payée. Standard = 1 semaine fixe, Premium/VIP = 1 mois. */
  days: number;
}

const PRICING_DEFAULTS: Record<string, EscortSubPricing> = {
  standard: { amount: 2500, days: 7 },
  premium: { amount: 5000, days: 30 },
  vip: { amount: 15000, days: 30 },
};

/** Prix + durée d'une période pour un tier d'abonnement (configurable via SiteSetting). */
export async function getEscortSubscriptionPricing(
  tier: Exclude<EscortSubscriptionTier, "NONE">,
): Promise<EscortSubPricing> {
  const tierKey = tier.toLowerCase();
  const fallback = PRICING_DEFAULTS[tierKey];
  const [amount, days] = await Promise.all([
    getSettingNumber(`pricing.escortSubscription.${tierKey}.amount`, fallback.amount),
    getSettingNumber(`pricing.escortSubscription.${tierKey}.days`, fallback.days),
  ]);
  return { amount, days };
}

/**
 * Guard à appeler AVANT la publication d'une annonce.
 * Refuse si pas d'abonnement actif OU si le quota d'annonces actives est atteint.
 */
export async function canEscortPublish(
  userId: string,
): Promise<{ ok: true; status: EscortSubStatus } | { ok: false; reason: string }> {
  const status = await getEscortSubscriptionStatus(userId);
  if (!status.isActive) {
    return {
      ok: false,
      reason: "Vous devez avoir un abonnement actif pour publier une annonce. Souscrivez à un plan (Standard, Premium ou VIP) sur /escort/abonnement.",
    };
  }
  const activeCount = await prisma.ad.count({
    where: {
      ownerId: userId,
      status: { in: ["ACTIVE", "PENDING", "DRAFT", "PAUSED"] },
    },
  });
  if (activeCount >= status.caps.ads) {
    return {
      ok: false,
      reason: `Vous avez atteint la limite de ${status.caps.ads} annonce${status.caps.ads > 1 ? "s" : ""} pour votre abonnement ${status.tier}. Upgradez vers un tier supérieur pour publier plus.`,
    };
  }
  return { ok: true, status };
}

// =====================================================================
// v21 — ESSAI GRATUIT « premier mois offert » pour les nouvelles escortes
//
// Toute nouvelle escorte (inscription directe ou conversion d'un compte
// client) reçoit un abonnement offert. À l'expiration, le cron
// `escort-subscriptions` remet le tier à NONE et met les annonces en
// PAUSED : le 2e mois redevient payant.
//
// L'essai est accordé UNE SEULE FOIS par compte (`escortTrialEndsAt` non
// nul = déjà consommé) et est désactivable depuis /admin/reglages.
// =====================================================================

export interface FreeTrialConfig {
  enabled: boolean;
  /** Durée de l'essai en jours. */
  days: number;
  /** Tier accordé pendant l'essai (quotas annonces/photos correspondants). */
  tier: PaidTier;
}

export const FREE_TRIAL_KEYS = {
  enabled: "escortSubscription.freeTrial.enabled",
  days: "escortSubscription.freeTrial.days",
  tier: "escortSubscription.freeTrial.tier",
} as const;

/**
 * Valeurs par défaut si les réglages n'existent pas encore en base.
 * `enabled: false` volontairement : tant que la migration v21 n'a pas été
 * jouée (elle seed la clé à `true`), le comportement payant reste inchangé.
 */
export const FREE_TRIAL_DEFAULTS: FreeTrialConfig = {
  enabled: false,
  days: 30,
  tier: "PREMIUM",
};

const TRUTHY = ["true", "1", "on", "yes"];

/** Lit la configuration de l'essai gratuit (une seule requête). */
export async function getFreeTrialConfig(db: Db = prisma): Promise<FreeTrialConfig> {
  const rows = await db.siteSetting.findMany({
    where: { key: { in: Object.values(FREE_TRIAL_KEYS) } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value.trim()]));

  const rawDays = Number(map.get(FREE_TRIAL_KEYS.days));
  const rawTier = (map.get(FREE_TRIAL_KEYS.tier) ?? "").toUpperCase();
  const enabledRaw = map.get(FREE_TRIAL_KEYS.enabled);

  return {
    enabled: enabledRaw === undefined
      ? FREE_TRIAL_DEFAULTS.enabled
      : TRUTHY.includes(enabledRaw.toLowerCase()),
    days: Number.isFinite(rawDays) && rawDays > 0 ? Math.floor(rawDays) : FREE_TRIAL_DEFAULTS.days,
    tier: (["STANDARD", "PREMIUM", "VIP"] as const).includes(rawTier as PaidTier)
      ? (rawTier as PaidTier)
      : FREE_TRIAL_DEFAULTS.tier,
  };
}

export type GrantTrialResult =
  | { granted: true; tier: PaidTier; days: number; until: Date }
  | { granted: false; reason: "disabled" | "already_used" | "already_subscribed" | "user_not_found" };

/**
 * Accorde l'essai gratuit à une escorte si elle y est éligible.
 *
 * Éligibilité :
 *  - l'essai est activé côté admin ;
 *  - le compte n'a JAMAIS eu d'essai (`escortTrialEndsAt` est null) ;
 *  - le compte n'a pas déjà un abonnement actif (ex. activé par un admin).
 *
 * Idempotent : un 2e appel sur le même compte renvoie `already_used`.
 * Passez le client de transaction pour l'inclure dans un `$transaction`.
 */
export async function grantEscortFreeTrial(userId: string, db: Db = prisma): Promise<GrantTrialResult> {
  const config = await getFreeTrialConfig(db);
  if (!config.enabled) return { granted: false, reason: "disabled" };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      escortTrialEndsAt: true,
      escortSubscriptionTier: true,
      escortSubscriptionUntil: true,
    },
  });
  if (!user) return { granted: false, reason: "user_not_found" };
  if (user.escortTrialEndsAt) return { granted: false, reason: "already_used" };

  const now = new Date();
  const hasActiveSub =
    user.escortSubscriptionTier !== "NONE" &&
    !!user.escortSubscriptionUntil &&
    user.escortSubscriptionUntil > now;
  if (hasActiveSub) return { granted: false, reason: "already_subscribed" };

  const until = new Date(now.getTime() + config.days * 86_400_000);

  await db.user.update({
    where: { id: userId },
    data: {
      escortSubscriptionTier: config.tier,
      escortSubscriptionUntil: until,
      escortSubscriptionAutoRenew: false,
      escortTrialStartedAt: now,
      escortTrialEndsAt: until,
    },
  });

  return { granted: true, tier: config.tier, days: config.days, until };
}

/** Libellé lisible de la durée d'essai ("1 mois", "15 jours"…). */
export function formatTrialDuration(days: number): string {
  if (days % 30 === 0 && days >= 30) {
    const months = days / 30;
    return months === 1 ? "1 mois" : `${months} mois`;
  }
  if (days % 7 === 0 && days >= 7) {
    const weeks = days / 7;
    return weeks === 1 ? "1 semaine" : `${weeks} semaines`;
  }
  return `${days} jour${days > 1 ? "s" : ""}`;
}
