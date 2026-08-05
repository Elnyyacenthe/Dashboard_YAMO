import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { timeAgo, formatXAF } from "@/lib/utils";

/**
 * Page Mon Compte — partagée entre /client/compte et /escort/compte.
 */
export default async function AccountPage({ backUrl = "/compte" }: { backUrl?: string }) {
  const session = await auth();
  if (!session?.user) redirect(`/connexion?callbackUrl=${backUrl}`);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { _count: { select: { ads: true, favorites: true, referrals: true } } },
  });
  if (!user) redirect("/connexion");

  // Pour les ADMIN/MODERATOR, lien externe vers affinité.com/admin (cf. dashboard-namespace.ts)
  const affiniteAdminUrl =
    process.env.NEXT_PUBLIC_AFFINITE_ADMIN_URL ??
    `${process.env.NEXT_PUBLIC_AFFINITE_URL ?? "https://affinité.com"}/admin`;
  const dashboardLink =
    user.role === "ADMIN" || user.role === "MODERATOR"
      ? affiniteAdminUrl
      : user.role === "ESCORT"
        ? "/escort/dashboard"
        : "/client";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-3xl font-bold">Mon compte</h1>

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{user.name ?? "Sans nom"}</h2>
            <Badge variant="outline">{user.role}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <p className="text-sm text-muted-foreground">{user.phone}</p>
          <p className="text-xs text-muted-foreground">Inscrit {timeAgo(user.createdAt)}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="font-display text-2xl font-bold text-primary">
              {formatXAF(user.walletBalance)}
            </p>
            <p className="text-xs text-muted-foreground">Solde</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="font-display text-2xl font-bold">{user._count.ads}</p>
            <p className="text-xs text-muted-foreground">Annonces</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="font-display text-2xl font-bold">{user._count.referrals}</p>
            <p className="text-xs text-muted-foreground">Filleuls</p>
          </CardContent>
        </Card>
      </div>

      <Button asChild className="w-full">
        <Link href={dashboardLink}>Accéder à mon dashboard</Link>
      </Button>

      <Card className="border-destructive/30">
        <CardContent className="space-y-2 p-6">
          <h3 className="font-semibold text-destructive">Zone dangereuse</h3>
          <p className="text-xs text-muted-foreground">
            Pour modifier votre email, téléphone ou supprimer votre compte, contactez le support à
            support@affinité.com.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
