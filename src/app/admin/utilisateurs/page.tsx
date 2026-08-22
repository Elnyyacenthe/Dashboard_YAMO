import Link from "next/link";
import type { Prisma, Role } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { UserActions } from "./_components/user-actions";

const PER_PAGE = 25;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";

  const sp = await searchParams;
  const q = sp.q ?? "";
  const role = sp.role as Role | undefined;
  const page = Math.max(1, Number(sp.page ?? "1"));

  const where: Prisma.UserWhereInput = {
    ...(role && { role }),
    ...(q && {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        escortProfile: { select: { id: true, isVerified: true } },
        _count: { select: { ads: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.user.count({ where }),
  ]);

  const pages = Math.ceil(total / PER_PAGE);
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Utilisateurs</h1>
        <p className="text-muted-foreground">{total} comptes</p>
      </div>

      <form className="flex gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Email, nom, téléphone…"
          className="max-w-md"
        />
        <select
          name="role"
          defaultValue={role ?? ""}
          className="rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Tous rôles</option>
          <option value="CLIENT">Client</option>
          <option value="ESCORT">Escort</option>
          <option value="MODERATOR">Modérateur</option>
          <option value="ADMIN">Admin</option>
        </select>
        <Button type="submit">Filtrer</Button>
      </form>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Utilisateur</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Rôle</th>
                <th className="p-3">Annonces</th>
                <th className="p-3">Vérifié</th>
                <th className="p-3">Inscrit</th>
                <th className="p-3">État</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/30 hover:bg-secondary/30">
                  <td className="p-3">
                    <div className="font-medium">{u.name ?? "—"}</div>
                  </td>
                  <td className="p-3 text-xs">
                    <div>{u.email}</div>
                    <div className="text-muted-foreground">{u.phone}</div>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline">{u.role}</Badge>
                    {/* v21 — essai gratuit en cours (abonnement offert non encore prolongé par un paiement) */}
                    {u.escortTrialEndsAt &&
                      u.escortSubscriptionUntil &&
                      u.escortSubscriptionUntil > now &&
                      u.escortSubscriptionUntil <= u.escortTrialEndsAt && (
                        <div
                          className="mt-1 text-[10px] font-semibold text-violet-400"
                          title={`Essai gratuit jusqu'au ${u.escortTrialEndsAt.toLocaleDateString("fr-FR")}`}
                        >
                          🎁 Essai · {u.escortTrialEndsAt.toLocaleDateString("fr-FR")}
                        </div>
                      )}
                  </td>
                  <td className="p-3">{u._count.ads}</td>
                  <td className="p-3">
                    {u.escortProfile?.isVerified ? (
                      <Badge variant="verified">Vérifié</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 text-xs">{timeAgo(u.createdAt)}</td>
                  <td className="p-3">
                    {u.isBanned ? (
                      <Badge variant="destructive">Banni</Badge>
                    ) : (
                      <Badge variant="success">Actif</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <UserActions
                      userId={u.id}
                      profileId={u.escortProfile?.id ?? null}
                      isBanned={u.isBanned}
                      isVerified={u.escortProfile?.isVerified ?? false}
                      currentRole={u.role}
                      canChangeRole={isAdmin}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/utilisateurs?page=${page - 1}&q=${q}&role=${role ?? ""}`}>← Précédent</Link>
            </Button>
          )}
          <span className="text-sm">
            Page {page} / {pages}
          </span>
          {page < pages && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/utilisateurs?page=${page + 1}&q=${q}&role=${role ?? ""}`}>Suivant →</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
