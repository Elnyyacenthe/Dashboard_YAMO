"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  initDeposit,
  getDepositStatus,
  classifyStatus,
  makeExternalId,
  normalizePhoneForKpay,
  isKpayConfigured,
  KpayError,
} from "@/lib/kpay";

// =====================================================================
// INTENT — action métier à appliquer après confirmation K-Pay
// =====================================================================

export type PaymentIntent =
  | { type: "BUMP"; payload: { adId: string } }
  | { type: "STICKY"; payload: { adId: string; hours: number } }
  | { type: "TIER_UPGRADE"; payload: { adId: string; tier: "PREMIUM" | "VIP" | "DIAMOND"; days: number; autoRenew?: boolean } }
  | { type: "SERVICE_PHOTO"; payload: { adId: string; url: string; imageHash?: string } }
  | { type: "VERIFICATION"; payload: { userId: string } }
  | { type: "ESCORT_SUBSCRIPTION"; payload: { userId: string; tier: "STANDARD" | "PREMIUM" | "VIP"; months: number; days: number; autoRenew?: boolean } };

export type IntentType = PaymentIntent["type"];

// =====================================================================
// INITIATION — crée le Payment + initie K-Pay
// =====================================================================

interface InitPaymentInput {
  userId: string;
  amount: number;
  phone: string;
  intent: PaymentIntent;
  description?: string;
}

export type InitPaymentResult =
  | { ok: true; paymentId: string; kpayId: string; message: string }
  | { ok: false; error: string };

/**
 * Initie un paiement K-Pay one-shot.
 *
 * Flux :
 *   1. Crée un Payment PENDING avec l'intent (action à appliquer)
 *   2. Appelle K-Pay /payments/init
 *   3. Met à jour le providerRef avec l'id K-Pay (pay_xxx)
 *   4. L'user reçoit le push MoMo/Orange et valide sur son téléphone
 *   5. Le polling client OU le pg_cron reconcile applique l'intent au succès
 *
 * Cette fonction ne touche PAS à un quelconque wallet.
 */
export async function kpayOneShotPayment(input: InitPaymentInput): Promise<InitPaymentResult> {
  if (!isKpayConfigured()) {
    return { ok: false, error: "Le système de paiement est temporairement indisponible." };
  }

  const phone = normalizePhoneForKpay(input.phone);
  if (phone.length !== 12 || !phone.startsWith("237")) {
    return { ok: false, error: "Numéro Cameroun invalide" };
  }

  const amount = Math.floor(Number(input.amount));
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: "Montant invalide" };
  }

  const externalId = makeExternalId(input.intent.type, input.userId);
  const description = input.description ?? defaultDescription(input.intent, amount);

  // 1. Payment PENDING avec intent
  const payment = await prisma.payment.create({
    data: {
      userId: input.userId,
      adId: "adId" in input.intent.payload ? (input.intent.payload.adId as string) : null,
      amount,
      currency: "XAF",
      provider: "MTN_MOMO", // K-Pay route auto vers MTN/Orange selon prefix
      status: "PENDING",
      providerRef: externalId,
      intent: input.intent as unknown as Prisma.InputJsonValue,
      metadata: { phone, externalId, kpay: { init: "pending" } },
    },
  });

  // 2. K-Pay init
  try {
    const kpay = await initDeposit({
      amount,
      phoneNumber: phone,
      externalId,
      description,
      metadata: { affiniteUserId: input.userId, affinitePaymentId: payment.id, intent: input.intent.type },
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerRef: kpay.id,
        metadata: { phone, externalId, kpay: { kpayId: kpay.id, status: kpay.status } },
      },
    });

    return {
      ok: true,
      paymentId: payment.id,
      kpayId: kpay.id,
      message: "Validez le paiement sur votre téléphone Mobile Money.",
    };
  } catch (e) {
    const msg = e instanceof KpayError ? e.message : "Erreur K-Pay";
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", metadata: { error: msg } },
    });
    return { ok: false, error: msg };
  }
}

// =====================================================================
// APPLICATION — quand le paiement est confirmé, on applique l'intent
// =====================================================================

/**
 * Vérifie le statut K-Pay d'un Payment et applique l'intent si succès.
 * Idempotent grâce à Payment.intentApplied.
 *
 * Appelée par :
 *   - Le polling client (action `pollPaymentAction` ou endpoint `/api/payments/[id]/poll`)
 *   - Le pg_cron reconcile (toutes les 5 min)
 */
export async function checkAndApplyIntent(paymentId: string): Promise<
  | { ok: true; status: "SUCCESS" | "PENDING" | "FAILED"; applied: boolean }
  | { ok: false; error: string }
> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false, error: "Paiement introuvable" };

  // Si déjà appliqué → idempotent
  if (payment.intentApplied) return { ok: true, status: "SUCCESS", applied: true };

  // Déjà finalisé en FAILED
  if (payment.status === "FAILED") return { ok: true, status: "FAILED", applied: false };

  // Pas de providerRef K-Pay → encore en attente d'init
  if (!payment.providerRef || !payment.providerRef.startsWith("pay_")) {
    return { ok: true, status: "PENDING", applied: false };
  }

  // Re-query K-Pay
  let kpayData;
  try {
    kpayData = await getDepositStatus(payment.providerRef);
  } catch {
    return { ok: true, status: "PENDING", applied: false };
  }

  const cls = classifyStatus(kpayData.status);

  if (cls === "PENDING") {
    return { ok: true, status: "PENDING", applied: false };
  }

  if (cls === "FAILED") {
    // status === "FAILED" est déjà filtré en amont
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    await prisma.notification.create({
      data: {
        userId: payment.userId,
        title: "Paiement échoué",
        body: `Votre paiement de ${payment.amount} FCFA n'a pas abouti. Réessayez.`,
      },
    });
    return { ok: true, status: "FAILED", applied: false };
  }

  // SUCCESS → validation montant + application de l'intent
  if (kpayData.amount && kpayData.amount !== payment.amount) {
    await prisma.auditLog.create({
      data: {
        action: "KPAY_AMOUNT_MISMATCH",
        entity: "Payment",
        entityId: payment.id,
        metadata: { ours: payment.amount, kpay: kpayData.amount },
      },
    });
    return { ok: false, error: "Montant K-Pay ne correspond pas" };
  }

  await applyIntent(payment.id);

  return { ok: true, status: "SUCCESS", applied: true };
}

/**
 * Applique l'intent d'un Payment confirmé. Idempotent + atomique.
 */
export async function applyIntent(paymentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error("Payment introuvable");
    if (payment.intentApplied) return; // idempotent
    if (!payment.intent) throw new Error("Payment sans intent");

    const intent = payment.intent as unknown as PaymentIntent;

    // Marque PAID + intentApplied DANS la transaction (anti race-condition)
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: "PAID",
        paidAt: payment.paidAt ?? new Date(),
        intentApplied: true,
        intentAppliedAt: new Date(),
      },
    });

    // Dispatch
    switch (intent.type) {
      case "BUMP": {
        await tx.ad.update({
          where: { id: intent.payload.adId },
          data: { lastBumpedAt: new Date(), bumpCount: { increment: 1 } },
        });
        break;
      }
      case "STICKY": {
        const ad = await tx.ad.findUnique({
          where: { id: intent.payload.adId },
          select: { stickyUntil: true },
        });
        const now = new Date();
        const base = ad?.stickyUntil && ad.stickyUntil > now ? ad.stickyUntil : now;
        const stickyUntil = new Date(base.getTime() + intent.payload.hours * 60 * 60 * 1000);
        await tx.ad.update({
          where: { id: intent.payload.adId },
          data: { stickyUntil },
        });
        break;
      }
      case "TIER_UPGRADE": {
        const promotedUntil = new Date(Date.now() + intent.payload.days * 86_400_000);
        await tx.ad.update({
          where: { id: intent.payload.adId },
          data: {
            tier: intent.payload.tier,
            promotedUntil,
            ...(intent.payload.autoRenew !== undefined && { autoRenew: intent.payload.autoRenew }),
          },
        });
        await tx.payment.update({
          where: { id: paymentId },
          data: { tier: intent.payload.tier, durationDays: intent.payload.days },
        });
        break;
      }
      case "SERVICE_PHOTO": {
        const position = await tx.media.count({ where: { adId: intent.payload.adId } });
        await tx.media.create({
          data: {
            adId: intent.payload.adId,
            url: intent.payload.url,
            type: "PHOTO",
            isServicePhoto: true,
            isApproved: false,
            paymentId,
            position,
            imageHash: intent.payload.imageHash ?? null,
          },
        });
        break;
      }
      case "VERIFICATION": {
        // L'IdVerification est créée séparément par le flow KYC.
        // Ici on marque juste que le paiement de vérif a été reçu.
        // Le client redirige ensuite l'user vers le formulaire KYC.
        break;
      }
      case "ESCORT_SUBSCRIPTION": {
        // Active ou prolonge l'abonnement mensuel escort.
        const user = await tx.user.findUnique({
          where: { id: intent.payload.userId },
          select: { escortSubscriptionUntil: true, role: true },
        });
        const now = new Date();
        const base = user?.escortSubscriptionUntil && user.escortSubscriptionUntil > now
          ? user.escortSubscriptionUntil
          : now;
        const newUntil = new Date(base.getTime() + intent.payload.days * 86_400_000);
        await tx.user.update({
          where: { id: intent.payload.userId },
          data: {
            escortSubscriptionTier: intent.payload.tier,
            escortSubscriptionUntil: newUntil,
            // Passe automatiquement en ESCORT si encore CLIENT
            ...(user?.role === "CLIENT" && { role: "ESCORT" }),
            ...(intent.payload.autoRenew !== undefined && {
              escortSubscriptionAutoRenew: intent.payload.autoRenew,
            }),
          },
        });
        await tx.payment.update({
          where: { id: paymentId },
          data: { durationDays: intent.payload.days },
        });
        break;
      }
    }

    // Notif user
    await tx.notification.create({
      data: {
        userId: payment.userId,
        title: notificationTitle(intent.type),
        body: notificationBody(intent.type, payment.amount),
      },
    });
  });

  // Hors transaction (revalidatePath ne peut pas tourner dedans)
  revalidatePath("/");
  revalidatePath("/escort/annonces");
  revalidatePath("/client");
}

// =====================================================================
// Helpers
// =====================================================================

function defaultDescription(intent: PaymentIntent, amount: number): string {
  switch (intent.type) {
    case "BUMP": return `Bump annonce (${amount} FCFA)`;
    case "STICKY": return `Sticky ${intent.payload.hours}h (${amount} FCFA)`;
    case "TIER_UPGRADE": return `${intent.payload.tier} ${intent.payload.days}j (${amount} FCFA)`;
    case "SERVICE_PHOTO": return `Photo service (${amount} FCFA)`;
    case "VERIFICATION": return `Vérification d'identité (${amount} FCFA)`;
    case "ESCORT_SUBSCRIPTION": return `Abonnement ${intent.payload.tier} ${intent.payload.months} mois (${amount} FCFA)`;
  }
}

function notificationTitle(type: IntentType): string {
  switch (type) {
    case "BUMP": return "Bump appliqué ✅";
    case "STICKY": return "Sticky activé 🚀";
    case "TIER_UPGRADE": return "Abonnement activé ⭐";
    case "SERVICE_PHOTO": return "Photo ajoutée 📸";
    case "VERIFICATION": return "Paiement vérification reçu ✅";
    case "ESCORT_SUBSCRIPTION": return "Abonnement Affinité activé 🎉";
  }
}

function notificationBody(type: IntentType, amount: number): string {
  const fmt = amount.toLocaleString("fr-FR");
  switch (type) {
    case "BUMP": return `Votre annonce a été remontée en tête (${fmt} FCFA reçu).`;
    case "STICKY": return `Votre annonce est épinglée au sommet de sa ville (${fmt} FCFA reçu).`;
    case "TIER_UPGRADE": return `Votre annonce est passée en tier supérieur (${fmt} FCFA reçu).`;
    case "SERVICE_PHOTO": return `Photo en attente de modération (${fmt} FCFA reçu).`;
    case "VERIFICATION": return `${fmt} FCFA reçus. Soumettez vos pièces d'identité pour finaliser la vérification.`;
    case "ESCORT_SUBSCRIPTION": return `${fmt} FCFA reçus. Vous pouvez maintenant publier vos annonces.`;
  }
}
