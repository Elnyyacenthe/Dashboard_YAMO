"use client";

import { useState, useTransition } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { markPaymentPaidAction, rejectPaymentAction } from "@/lib/actions/admin";

const QUICK_REASONS = [
  "Référence introuvable côté Mobile Money",
  "Montant reçu incorrect",
  "Numéro d'envoi ne correspond pas",
  "Aucun paiement reçu à ce jour",
  "Paiement déjà utilisé pour une autre déclaration",
];

export function PaymentActions({ paymentId }: { paymentId: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  function validate() {
    startTransition(async () => {
      try {
        await markPaymentPaidAction(paymentId);
        toast.success("Paiement validé et appliqué");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function submitReject() {
    if (!reason.trim()) return toast.error("Motif requis");
    startTransition(async () => {
      try {
        await rejectPaymentAction(paymentId, reason);
        toast.success("Paiement refusé");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={validate}
        disabled={pending}
        size="sm"
        className="bg-emerald-600 hover:bg-emerald-700"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
        Valider
      </Button>
      <Button
        onClick={() => {
          setReason("");
          setOpen(true);
        }}
        disabled={pending}
        size="sm"
        variant="outline"
      >
        <XCircle className="h-4 w-4" /> Refuser
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser le paiement</DialogTitle>
            <DialogDescription>
              L'utilisateur sera notifié du refus avec ce motif (ex : référence introuvable, montant
              incorrect).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
              >
                {r}
              </button>
            ))}
          </div>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motif du refus…"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submitReject} disabled={pending} variant="destructive">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmer le refus
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
