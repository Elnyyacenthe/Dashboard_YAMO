"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import type { TicketStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setTicketStatusAction, dismissTicketAction } from "@/lib/actions/support";

export function StatusSwitcher({
  ticketId,
  currentStatus,
}: {
  ticketId: string;
  currentStatus: TicketStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissing, startDismiss] = useTransition();

  function change(s: TicketStatus) {
    startTransition(async () => {
      try {
        await setTicketStatusAction(ticketId, s);
        toast.success(`Statut → ${s}`);
        router.refresh();
      } catch {
        toast.error("Erreur");
      }
    });
  }

  function dismiss() {
    if (!confirm("Ignorer ce signalement ? Un message automatique sera envoyé au client et la conversation sera clôturée.")) {
      return;
    }
    startDismiss(async () => {
      const res = await dismissTicketAction(ticketId);
      if (res.ok) {
        toast.success("Signalement ignoré, client notifié");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-card/40 p-3">
      <span className="text-sm font-medium">Statut :</span>
      <Select value={currentStatus} onValueChange={(v) => change(v as TicketStatus)} disabled={pending}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="OPEN">OPEN — à traiter</SelectItem>
          <SelectItem value="IN_PROGRESS">IN_PROGRESS — en cours</SelectItem>
          <SelectItem value="WAITING_USER">WAITING_USER — attend retour</SelectItem>
          <SelectItem value="CLOSED">CLOSED — terminé</SelectItem>
        </SelectContent>
      </Select>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}

      {currentStatus !== "CLOSED" && (
        <Button variant="outline" size="sm" onClick={dismiss} disabled={dismissing} className="ml-auto">
          {dismissing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
          Ignorer le signalement
        </Button>
      )}
    </div>
  );
}
