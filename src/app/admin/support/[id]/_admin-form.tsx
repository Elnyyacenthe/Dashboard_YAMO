"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateReactHelpers } from "@uploadthing/react";
import { Loader2, Send, Paperclip, X, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import type { TicketStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminReplyTicketAction, setTicketStatusAction, dismissTicketAction } from "@/lib/actions/support";
import type { OurFileRouter } from "@/lib/uploadthing";

const { useUploadThing } = generateReactHelpers<OurFileRouter>();

export function AdminReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const { startUpload, isUploading } = useUploadThing("supportAttachment", {
    onClientUploadComplete: (res) => {
      if (res?.[0]) setAttachment({ url: res[0].url, name: res[0].name });
    },
    onUploadError: (err) => {
      toast.error(err.message);
    },
  });

  const busy = pending || isUploading;

  function submit() {
    if (!body.trim() && !attachment) return;
    startTransition(async () => {
      const res = await adminReplyTicketAction({
        ticketId,
        body,
        attachmentUrl: attachment?.url,
        attachmentName: attachment?.name,
      });
      if (res.ok) {
        toast.success("Réponse envoyée");
        setBody("");
        setAttachment(null);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Votre réponse à l'utilisateur…"
        rows={5}
        disabled={busy}
      />

      {attachment && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="flex-1 truncate">{attachment.name}</span>
          <button type="button" onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label
            htmlFor="admin-support-attachment-input"
            className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Paperclip className="h-4 w-4" />
            {isUploading ? "Envoi…" : "Joindre un fichier"}
          </label>
          <input
            id="admin-support-attachment-input"
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) startUpload([file]);
              e.target.value = "";
            }}
          />
        </div>
        <Button onClick={submit} disabled={busy || (!body.trim() && !attachment)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Envoyer
        </Button>
      </div>
    </div>
  );
}

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
