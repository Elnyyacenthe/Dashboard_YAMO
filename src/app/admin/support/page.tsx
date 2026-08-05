import Link from "next/link";
import { MessageSquare } from "lucide-react";
import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";

const ROLES = ["ALL", "ESCORT", "CLIENT"] as const;

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; role?: string }>;
}) {
  const sp = await searchParams;
  const status = (sp.status ?? "OPEN") as "OPEN" | "IN_PROGRESS" | "WAITING_USER" | "CLOSED";
  const role = (ROLES as readonly string[]).includes(sp.role ?? "") ? (sp.role as (typeof ROLES)[number]) : "ALL";

  const tickets = await prisma.supportTicket.findMany({
    where: {
      status,
      ...(role !== "ALL" && { user: { role: role as Role } }),
    },
    include: {
      user: { select: { name: true, email: true, role: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">
          <MessageSquare className="mr-2 inline h-7 w-7" /> Service client
        </h1>
        <p className="text-muted-foreground">{tickets.length} conversations en statut {status}</p>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          {["OPEN", "IN_PROGRESS", "WAITING_USER", "CLOSED"].map((s) => (
            <Button key={s} asChild size="sm" variant={s === status ? "default" : "outline"}>
              <Link href={`/admin/support?status=${s}&role=${role}`}>{s}</Link>
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          {ROLES.map((r) => (
            <Button key={r} asChild size="sm" variant={r === role ? "secondary" : "ghost"}>
              <Link href={`/admin/support?status=${status}&role=${r}`}>
                {r === "ALL" ? "Tous" : r === "ESCORT" ? "Escortes" : "Clients"}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {tickets.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">Aucune conversation {status}</Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Link key={t.id} href={`/admin/support/${t.id}`}>
              <Card className="cursor-pointer p-4 transition hover:border-primary">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{t.user.name ?? t.user.email}</h3>
                      <Badge variant={t.user.role === "ESCORT" ? "vip" : "outline"}>{t.user.role}</Badge>
                      <Badge>{t.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.user.email} · {t._count.messages} msg · {timeAgo(t.updatedAt)}
                    </p>
                  </div>
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
