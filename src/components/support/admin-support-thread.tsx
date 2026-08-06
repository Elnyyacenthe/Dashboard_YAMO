"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateReactHelpers } from "@uploadthing/react";
import { Loader2, Send, MessageSquare, Paperclip, X, FileText, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { adminReplyTicketAction } from "@/lib/actions/support";
import type { OurFileRouter } from "@/lib/uploadthing";

const { useUploadThing } = generateReactHelpers<OurFileRouter>();

export interface AdminThreadMessage {
  id: string;
  body: string;
  isAdmin: boolean;
  createdAt: Date;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
}

function isImageFile(name?: string | null) {
  return !!name && /\.(jpe?g|png|gif|webp|avif)$/i.test(name);
}

function dayKey(d: Date) {
  return d.toDateString();
}

function formatDayLabel(d: Date) {
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function Attachment({ url, name, mine }: { url: string; name?: string | null; mine: boolean }) {
  if (isImageFile(name)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
        <Image
          src={url}
          alt={name ?? "Pièce jointe"}
          width={220}
          height={220}
          className="max-h-56 w-auto rounded-lg border border-border/60 object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        mine
          ? "border-primary-foreground/30 bg-primary-foreground/10 hover:border-primary-foreground/50"
          : "border-border/60 bg-secondary/40 hover:border-primary/50"
      }`}
    >
      <FileText className="h-4 w-4 shrink-0 opacity-70" />
      <span className="truncate">{name ?? "Document joint"}</span>
    </a>
  );
}

export function AdminSupportThread({
  ticketId,
  messages,
  userName,
  userImage,
  closed,
}: {
  ticketId: string;
  messages: AdminThreadMessage[];
  userName: string;
  userImage?: string | null;
  closed: boolean;
}) {
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

  function submit() {
    const trimmed = body.trim();
    if (!trimmed && !attachment) return;
    startTransition(async () => {
      const res = await adminReplyTicketAction({
        ticketId,
        body: trimmed,
        attachmentUrl: attachment?.url,
        attachmentName: attachment?.name,
      });
      if (res.ok) {
        setBody("");
        setAttachment(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const busy = pending || isUploading;

  // Groupe les messages par jour pour afficher un séparateur de date.
  let lastDay = "";

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1 rounded-2xl border border-border/50 bg-secondary/20 p-4">
        {messages.length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Aucun message dans cette conversation.</p>
          </div>
        ) : (
          messages.map((m) => {
            const key = dayKey(m.createdAt);
            const showDivider = key !== lastDay;
            lastDay = key;

            return (
              <div key={m.id}>
                {showDivider && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-background px-4 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                      {formatDayLabel(m.createdAt)}
                    </span>
                  </div>
                )}
                <div className={`flex items-end gap-2 py-1.5 ${m.isAdmin ? "flex-row-reverse" : ""}`}>
                  <Avatar className="h-8 w-8 shrink-0 border border-border/40">
                    {m.isAdmin ? (
                      <AvatarFallback className="bg-primary/15 text-primary">
                        <ShieldCheck className="h-4 w-4" />
                      </AvatarFallback>
                    ) : (
                      <>
                        <AvatarImage src={userImage ?? undefined} alt={userName} />
                        <AvatarFallback className="bg-secondary text-foreground">
                          {userName[0]?.toUpperCase() ?? "U"}
                        </AvatarFallback>
                      </>
                    )}
                  </Avatar>

                  <div className={`flex max-w-[75%] flex-col gap-1 ${m.isAdmin ? "items-end" : "items-start"}`}>
                    <div
                      className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                        m.isAdmin
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm border border-border/50 bg-card"
                      }`}
                    >
                      <p className={`mb-0.5 text-xs font-semibold ${m.isAdmin ? "text-primary-foreground/80" : "text-primary"}`}>
                        {m.isAdmin ? "Équipe Affinité" : userName}
                      </p>
                      {m.body && <p className="whitespace-pre-wrap text-sm">{m.body}</p>}
                      {m.attachmentUrl && (
                        <Attachment url={m.attachmentUrl} name={m.attachmentName} mine={m.isAdmin} />
                      )}
                    </div>
                    <span className="px-1 text-[10px] text-muted-foreground">{formatTime(m.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!closed && (
        <>
          {attachment && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="flex-1 truncate">{attachment.name}</span>
              <button type="button" onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card px-2 py-2 shadow-sm">
            <label
              htmlFor="admin-support-attachment-input"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Joindre un fichier"
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
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

            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Votre réponse à l'utilisateur…"
              maxLength={3000}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />

            <button
              type="button"
              onClick={submit}
              disabled={busy || (!body.trim() && !attachment)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              aria-label="Envoyer"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
