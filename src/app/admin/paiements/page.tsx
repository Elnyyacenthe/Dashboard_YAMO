import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatXAF, timeAgo } from "@/lib/utils";
import { PaymentActions } from "./_components/payment-actions";

interface PaymentIntentLike {
  type?: string;
  payload?: { tier?: string; months?: number; hours?: number; days?: number };
}
interface PaymentMetaLike {
  declaredPhone?: string;
  declaredReference?: string;
}

function intentSummary(intent: unknown): string | null {
  const i = intent as PaymentIntentLike | null;
  if (!i?.type) return null;
  if (i.type === "ESCORT_SUBSCRIPTION") {
    return `Abonnement ${i.payload?.tier ?? "?"} — ${i.payload?.months ?? "?"} mois`;
  }
  return i.type;
}

export default async function PaymentsPage() {
  const [pending, all, totalPaid] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "PENDING" },
      include: { user: { select: { email: true, name: true } }, ad: { select: { title: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.payment.findMany({
      where: { status: { in: ["PAID", "FAILED", "REFUNDED"] } },
      include: { user: { select: { email: true } }, ad: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.payment.aggregate({ where: { status: "PAID" }, _sum: { amount: true }, _count: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Paiements</h1>
        <p className="text-muted-foreground">
          Total : <strong>{formatXAF(totalPaid._sum.amount ?? 0)}</strong> ({totalPaid._count} transactions payées)
        </p>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl font-bold">
          ⏳ Paiements en attente ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun paiement en attente</p>
        ) : (
          <div className="space-y-2">
            {pending.map((p) => {
              const summary = intentSummary(p.intent);
              const meta = p.metadata as PaymentMetaLike | null;
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 p-3"
                >
                  <div>
                    <p className="font-semibold">
                      {formatXAF(p.amount)}{" "}
                      {p.provider === "MANUAL" && (
                        <Badge variant="outline" className="ml-1 align-middle">
                          Déclaration manuelle
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.user.name ?? p.user.email} ({p.user.email}) · {p.provider} · {timeAgo(p.createdAt)}
                    </p>
                    {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
                    {p.ad && (
                      <p className="text-xs text-muted-foreground">
                        Annonce : {p.ad.title} ({p.tier} {p.durationDays}j)
                      </p>
                    )}
                    {meta?.declaredPhone && (
                      <p className="text-xs text-muted-foreground">
                        Envoyé depuis : <span className="font-mono">{meta.declaredPhone}</span>
                      </p>
                    )}
                    {meta?.declaredReference && (
                      <p className="text-xs text-muted-foreground">
                        Réf. déclarée : <span className="font-mono">{meta.declaredReference}</span>
                      </p>
                    )}
                    {p.providerRef && (
                      <p className="text-xs font-mono text-muted-foreground">Ref: {p.providerRef}</p>
                    )}
                  </div>
                  <PaymentActions paymentId={p.id} />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl font-bold">Historique récent</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Date</th>
                <th className="p-2">Utilisateur</th>
                <th className="p-2">Montant</th>
                <th className="p-2">Provider</th>
                <th className="p-2">Tier</th>
                <th className="p-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {all.map((p) => (
                <tr key={p.id} className="border-b border-border/30">
                  <td className="p-2 text-xs">{timeAgo(p.paidAt ?? p.createdAt)}</td>
                  <td className="p-2 text-xs">{p.user.email}</td>
                  <td className="p-2">{formatXAF(p.amount)}</td>
                  <td className="p-2 text-xs">{p.provider}</td>
                  <td className="p-2">{p.tier && <Badge>{p.tier}</Badge>}</td>
                  <td className="p-2">
                    <Badge variant={p.status === "PAID" ? "success" : "destructive"}>{p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
