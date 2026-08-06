import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { OnboardForm } from "./_form";

export default async function AdminEscortOnboardingPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  // 30 derniers onboardings manuels (audit)
  const recent = await prisma.auditLog.findMany({
    where: { action: { in: ["ADMIN_ESCORT_ONBOARDING", "ADMIN_SUBSCRIPTION_GRANTED"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
          <UserPlus className="h-7 w-7" /> Onboarding manuel escort
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Créer un compte escort + activer son abonnement (paiement cash IRL, hors K-Pay).
        </p>
      </header>

      <Card>
        <CardContent className="p-6">
          <OnboardForm />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h2 className="font-display text-xl font-bold">Historique récent</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun onboarding manuel récent.</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((log) => {
                const meta = log.metadata as { tier?: string; months?: number; until?: string; notes?: string } | null;
                return (
                  <li key={log.id} className="rounded-lg border border-border/40 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {log.action === "ADMIN_ESCORT_ONBOARDING" ? "✨ Nouveau compte" : "🔁 Abonnement activé"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("fr-FR")}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Par : {log.actor?.name ?? log.actor?.email ?? "Admin"} · UserId : <code>{log.entityId}</code>
                    </p>
                    {meta && (
                      <p className="mt-1 text-xs">
                        Tier <strong>{meta.tier}</strong> ·{" "}
                        {meta.tier === "STANDARD" ? "1 semaine" : `${meta.months} mois`} · jusqu'au{" "}
                        {meta.until && new Date(meta.until).toLocaleDateString("fr-FR")}
                        {meta.notes && <> · <em>{meta.notes}</em></>}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
