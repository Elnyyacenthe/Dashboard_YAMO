/**
 * K-Pay — client API (https://admin.kpay.site)
 *
 * Stratégie de sécurité (inspirée de gost_app) :
 *   - L'init est un proxy server-side (jamais d'appel direct depuis le navigateur,
 *     CORS bloquerait + on ne veut pas exposer les clés API)
 *   - Le webhook K-Pay sert juste de "trigger" instantané — on ne fait JAMAIS
 *     confiance au body brut. On re-interroge l'API K-Pay (GET status) avec NOS
 *     clés pour confirmer le vrai statut. Cela rend les faux webhooks inoffensifs.
 *   - Idempotence wallet : chaque crédit utilise un `request_id` unique
 *     (kpay_dep_<txId>, kpay_wd_refund_<externalId>)
 *
 * Variables d'env (.env) :
 *   KPAY_BASE_URL=https://admin.kpay.site
 *   KPAY_API_KEY=kpay_live_xxx       (ou kpay_test_xxx en sandbox)
 *   KPAY_SECRET_KEY=...
 *   KPAY_WEBHOOK_SECRET=...          (optionnel, défense en profondeur)
 *   KPAY_CALLBACK_URL=https://affinité.com/api/webhooks/kpay
 */

import crypto from "node:crypto";

import { normalizeCameroonPhone } from "@/lib/phone";

const KPAY_BASE = process.env.KPAY_BASE_URL ?? "https://admin.kpay.site";

export class KpayError extends Error {
  constructor(public code: string, message: string, public httpStatus?: number) {
    super(message);
    this.name = "KpayError";
  }
}

function getCreds() {
  const apiKey = process.env.KPAY_API_KEY;
  const secretKey = process.env.KPAY_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new KpayError("KPAY_NOT_CONFIGURED", "Clés K-Pay manquantes dans .env");
  }
  return { apiKey, secretKey };
}

const HEADERS_BASE = () => {
  const { apiKey, secretKey } = getCreds();
  return {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
    "X-Secret-Key": secretKey,
  };
};

// =====================================================================
// Types
// =====================================================================

/** Statuts officiels K-Pay (cf. doc) — l'API renvoie ces 6 valeurs. */
export type KpayStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "SUBMITTED"
  // Alias rétro-compat
  | "SUCCESS"
  | "REJECTED"
  | "EXPIRED";

/** Failure reasons documentées par K-Pay. */
export type KpayFailureReason =
  | "PAYER_LIMIT_REACHED"
  | "PAYER_NOT_FOUND"
  | "PAYMENT_NOT_APPROVED"
  | "RECIPIENT_NOT_FOUND"
  | "UNSPECIFIED_FAILURE";

export interface KpayPayment {
  id: string;
  reference?: string;
  providerReference?: string;
  status: KpayStatus;
  amount: number;
  /** Montant net effectivement crédité (après frais K-Pay) — calculé par K-Pay. */
  netAmount?: number;
  /** Frais K-Pay prélevés sur le montant brut. */
  feeAmount?: number;
  currency?: string;
  provider?: KpayProvider;
  country?: string;
  phoneNumber: string;
  externalId: string;
  description?: string;
  failureReason?: KpayFailureReason | string;
  isTest?: boolean;
  createdAt?: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface InitDepositInput {
  amount: number;
  phoneNumber: string;     // 237XXXXXXXXX (sans +)
  externalId: string;
  description?: string;
  customerEmail?: string;
  customerName?: string;
  metadata?: Record<string, unknown>;
  /** Code provider K-Pay (cf. doc). Si non fourni, détecté depuis le numéro. */
  provider?: KpayProvider;
}

export interface InitWithdrawalInput {
  amount: number;
  phoneNumber: string;
  description?: string;
  provider?: KpayProvider;
}

// =====================================================================
// Helpers
// =====================================================================

/**
 * Codes provider K-Pay officiels (cf. doc /documentation/paiements).
 * Format : OPERATEUR_COUNTRY (CMR = Cameroun).
 */
export type KpayProvider = "MTN_MOMO_CMR" | "ORANGE_CMR";

/** Alias rétro-compat — déprécié, utiliser KpayProvider. */
export type KpayPaymentMethod = KpayProvider;

/**
 * Détecte l'opérateur (MTN ou Orange) à partir d'un numéro Cameroun normalisé.
 *
 * Plages actuelles (CRTC Cameroun) :
 *   - MTN Cameroon  : 67X, 68X, 650-654
 *   - Orange Cameroon : 69X, 655-659
 *
 * En cas d'ambiguïté ou de prefix inconnu → MTN par défaut (couverture la plus large).
 */
export function detectProvider(phone: string): KpayProvider {
  const normalized = normalizeCameroonPhone(phone);
  if (!normalized.startsWith("237") || normalized.length !== 12) return "MTN_MOMO_CMR";

  const prefix2 = normalized.slice(3, 5);
  const prefix3 = normalized.slice(3, 6);

  if (prefix2 === "67" || prefix2 === "68") return "MTN_MOMO_CMR";
  if (prefix2 === "69") return "ORANGE_CMR";
  if (prefix3.startsWith("65")) {
    const last = Number(prefix3[2]);
    if (last >= 0 && last <= 4) return "MTN_MOMO_CMR";
    if (last >= 5 && last <= 9) return "ORANGE_CMR";
  }
  return "MTN_MOMO_CMR";
}

/** @deprecated Utiliser detectProvider(). */
export const detectPaymentMethod = detectProvider;

/** ID externe unique pour idempotence côté K-Pay et anti-double-paiement. */
export function makeExternalId(prefix: string, userId: string): string {
  const short = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}_${short}_${userId}`;
}

/** Indique si la config K-Pay est complète. */
export function isKpayConfigured(): boolean {
  return Boolean(process.env.KPAY_API_KEY && process.env.KPAY_SECRET_KEY);
}

// =====================================================================
// API : Dépôts (Payment Init)
// =====================================================================

/**
 * Initialise un dépôt : K-Pay envoie une notif push au téléphone du client
 * qui valide depuis son app MoMo/Orange. Retourne l'id K-Pay (pay_xxx).
 */
export async function initDeposit(input: InitDepositInput): Promise<KpayPayment> {
  // Auto-détection du provider si pas fourni explicitement
  const provider = input.provider ?? detectProvider(input.phoneNumber);

  const body = {
    amount: input.amount,
    provider, // ⚠️ K-Pay attend `provider` (MTN_MOMO_CMR / ORANGE_CMR), pas `paymentMethod`
    phoneNumber: input.phoneNumber,
    externalId: input.externalId,
    description: input.description ?? `Dépôt de ${input.amount} FCFA sur Affinité`,
    ...(input.customerEmail && { customerEmail: input.customerEmail }),
    ...(input.customerName && { customerName: input.customerName }),
    ...(input.metadata && { metadata: input.metadata }),
  };

  let resp: Response;
  try {
    resp = await fetch(`${KPAY_BASE}/api/v1/payments/init`, {
      method: "POST",
      headers: HEADERS_BASE(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new KpayError(
      "KPAY_NETWORK_ERROR",
      `Réseau injoignable : ${String(e).slice(0, 80)}`,
    );
  }

  let data: Partial<KpayPayment> & { message?: string; error?: string } = {};
  try {
    data = (await resp.json()) as never;
  } catch {
    /* ignore JSON parse error */
  }

  if (!resp.ok || !data.id) {
    const msg = data.message ?? data.error ?? `K-Pay refuse l'init (HTTP ${resp.status})`;
    throw new KpayError("KPAY_INIT_REFUSED", msg, resp.status);
  }

  return data as KpayPayment;
}

/** Récupère le statut d'un dépôt par son id K-Pay (pay_xxx). */
export async function getDepositStatus(paymentId: string): Promise<KpayPayment> {
  const resp = await fetch(`${KPAY_BASE}/api/v1/payments/${paymentId}`, {
    method: "GET",
    headers: HEADERS_BASE(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new KpayError("KPAY_HTTP", `HTTP ${resp.status}`, resp.status);
  const body = (await resp.json()) as { data?: KpayPayment } & KpayPayment;
  return (body.data ?? body) as KpayPayment;
}

// =====================================================================
// API : Retraits (Disbursement)
// =====================================================================

export async function initWithdrawal(input: InitWithdrawalInput): Promise<KpayPayment> {
  const provider = input.provider ?? detectProvider(input.phoneNumber);

  const body = {
    amount: input.amount,
    provider, // ⚠️ K-Pay attend `provider`, pas `paymentMethod`
    phoneNumber: input.phoneNumber,
    description: input.description ?? `Retrait Affinité de ${input.amount} FCFA`,
  };

  let resp: Response;
  try {
    resp = await fetch(`${KPAY_BASE}/api/v1/payments/withdraw`, {
      method: "POST",
      headers: HEADERS_BASE(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new KpayError("KPAY_NETWORK_ERROR", `Réseau : ${String(e).slice(0, 80)}`);
  }

  let data: Partial<KpayPayment> & { message?: string; error?: string } = {};
  try {
    data = (await resp.json()) as never;
  } catch { /* */ }

  if (!resp.ok || !data.id) {
    const msg = data.message ?? data.error ?? `Retrait refusé (HTTP ${resp.status})`;
    throw new KpayError("KPAY_WITHDRAW_REFUSED", msg, resp.status);
  }

  return data as KpayPayment;
}

export async function getWithdrawalStatus(withdrawalId: string): Promise<KpayPayment> {
  const resp = await fetch(`${KPAY_BASE}/api/v1/payments/withdraw/${withdrawalId}`, {
    method: "GET",
    headers: HEADERS_BASE(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new KpayError("KPAY_HTTP", `HTTP ${resp.status}`, resp.status);
  const body = (await resp.json()) as { data?: KpayPayment } & KpayPayment;
  return (body.data ?? body) as KpayPayment;
}

// =====================================================================
// Webhook signature
// =====================================================================

/**
 * Vérifie la signature HMAC-SHA256 d'un webhook K-Pay.
 * Si `secret` n'est pas fourni → renvoie `null` (vérification désactivée).
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean | null {
  const secret = process.env.KPAY_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (!secret) {
    if (isProd) {
      console.error(
        "[KPAY SECURITY] KPAY_WEBHOOK_SECRET manquant en production — webhook rejeté.",
      );
      return false;
    }
    return null; // En dev sans secret = tolérant
  }
  if (!signature) {
    if (isProd) return false;
    return null;
  }

  const cleaned = signature.toLowerCase().replace(/^sha256=/, "");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  if (cleaned.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cleaned), Buffer.from(expected));
}

/** Helper : qualifie un statut K-Pay en succès / échec / pending. */
export function classifyStatus(status: string): "SUCCESS" | "FAILED" | "PENDING" {
  const s = status.toUpperCase();
  // Statuts terminaux SUCCESS
  if (s === "COMPLETED" || s === "SUCCESS") return "SUCCESS";
  // Statuts terminaux FAILED
  if (["FAILED", "EXPIRED", "CANCELLED", "REJECTED"].includes(s)) return "FAILED";
  // Statuts intermédiaires (PENDING, PROCESSING, SUBMITTED) → on continue le polling
  return "PENDING";
}

/** Mapping français des failure reasons K-Pay (pour notifs utilisateur). */
export function explainFailureReason(reason?: string | null): string {
  switch (reason) {
    case "PAYER_LIMIT_REACHED": return "Plafond Mobile Money atteint pour ce numéro.";
    case "PAYER_NOT_FOUND":     return "Numéro Mobile Money introuvable ou inactif.";
    case "PAYMENT_NOT_APPROVED":return "Paiement refusé par le client (PIN incorrect ou annulation).";
    case "RECIPIENT_NOT_FOUND": return "Numéro destinataire introuvable (pour les retraits).";
    case "UNSPECIFIED_FAILURE": return "Erreur Mobile Money non spécifiée. Réessayez.";
    default:                    return reason ? `Erreur K-Pay : ${reason}` : "Paiement non abouti.";
  }
}
