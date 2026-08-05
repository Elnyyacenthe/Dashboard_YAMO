import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, FileText } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { AdminReplyForm, StatusSwitcher } from "./_admin-form";

function isImageFile(name?: string | null) {
  return !!name && /\.(jpe?g|png|gif|webp|avif)$/i.test(name);
}

function Attachment({ url, name }: { url: string; name?: string | null }) {
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
      className="mt-2 flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm hover:border-primary/50"
    >
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{name ?? "Document joint"}</span>
    </a>
  );
}

export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, role: true, phone: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
    },
  });
  if (!ticket) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/support"><ArrowLeft className="h-4 w-4" /> Retour</Link>
      </Button>

      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{ticket.status}</Badge>
            <Badge variant="outline">{ticket.user.role}</Badge>
          </div>
          <h1 className="font-display text-2xl font-bold">{ticket.user.name ?? ticket.user.email}</h1>
          <p className="text-xs text-muted-foreground">
            {ticket.user.email} · {ticket.user.phone ?? "—"} · Discussion ouverte {timeAgo(ticket.createdAt)}
          </p>
        </CardContent>
      </Card>

      <StatusSwitcher ticketId={ticket.id} currentStatus={ticket.status} />

      <div className="space-y-3">
        {ticket.messages.map((m) => (
          <Card key={m.id} className={m.isAdmin ? "border-primary/40 bg-primary/5" : "border-border/60"}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <strong className={m.isAdmin ? "text-primary" : ""}>
                  {m.isAdmin ? "🛡️ Équipe" : m.author.name ?? "Utilisateur"}
                </strong>
                <span>{timeAgo(m.createdAt)}</span>
              </div>
              {m.body && <p className="whitespace-pre-wrap text-sm">{m.body}</p>}
              {m.attachmentUrl && <Attachment url={m.attachmentUrl} name={m.attachmentName} />}
            </CardContent>
          </Card>
        ))}
      </div>

      {ticket.status !== "CLOSED" && (
        <Card>
          <CardContent className="p-4">
            <AdminReplyForm ticketId={ticket.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
