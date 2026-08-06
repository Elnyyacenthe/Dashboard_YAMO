import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { AdminSupportThread } from "@/components/support/admin-support-thread";
import { StatusSwitcher } from "./_admin-form";

export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, role: true, phone: true, image: true } },
      messages: { orderBy: { createdAt: "asc" } },
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

      <AdminSupportThread
        ticketId={ticket.id}
        messages={ticket.messages}
        userName={ticket.user.name ?? ticket.user.email ?? "Utilisateur"}
        userImage={ticket.user.image}
        closed={ticket.status === "CLOSED"}
      />
    </div>
  );
}
