import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingRow } from "./_setting-row";

const CATEGORY_LABELS: Record<string, { title: string; color: string }> = {
  pricing: { title: "💰 Tarifs Premium / VIP", color: "border-primary/30" },
  referral: { title: "🎁 Bonus parrainage", color: "border-amber-500/30" },
  limits: { title: "⚙️ Limites (dépôt / retrait)", color: "border-sky-500/30" },
  free_trial: { title: "🎁 Essai gratuit nouvelles escortes (voir Réglages)", color: "border-violet-500/30" },
  manual_payment: { title: "💳 Paiement manuel (voir Réglages)", color: "border-emerald-500/30" },
  general: { title: "Autres", color: "border-border" },
};

export default async function TarifsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/admin");

  const settings = await prisma.siteSetting.findMany({
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });

  const byCategory = settings.reduce<Record<string, typeof settings>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Réglages dynamiques</h1>
        <p className="text-muted-foreground">
          Modifiez les tarifs, bonus et limites sans redéployer le site.
        </p>
      </div>

      {Object.entries(byCategory).map(([cat, items]) => {
        const meta = CATEGORY_LABELS[cat] ?? CATEGORY_LABELS.general;
        return (
          <Card key={cat} className={meta.color}>
            <CardContent className="p-6">
              <h2 className="mb-4 font-display text-xl font-bold">{meta.title}</h2>
              <div className="space-y-2">
                {items.map((s) => (
                  <SettingRow key={s.key} setting={s} />
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
