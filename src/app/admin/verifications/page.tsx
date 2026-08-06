import Image from "next/image";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import { VerificationActions } from "./_actions";

export default async function VerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab ?? "PENDING";

  const verifs = await prisma.idVerification.findMany({
    where: { status: tab as never },
    include: {
      user: { select: { id: true, email: true, name: true, phone: true } },
      reviewedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Vérifications d'identité</h1>
        <p className="text-muted-foreground">Validez les pièces d'identité des escorts</p>
      </div>

      <div className="flex gap-2">
        {["PENDING", "VERIFIED", "REJECTED"].map((s) => (
          <Button key={s} asChild variant={tab === s ? "default" : "outline"} size="sm">
            <Link href={`/admin/verifications?tab=${s}`}>{s}</Link>
          </Button>
        ))}
      </div>

      {verifs.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            {tab === "PENDING" ? "Aucune vérification à examiner 🎉" : `Aucune vérification ${tab}`}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {verifs.map((v) => (
            <Card key={v.id}>
              <CardContent className="grid gap-4 p-6 md:grid-cols-[1fr_auto]">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {v.documentType && <Badge variant="outline">{v.documentType}</Badge>}
                    <Badge variant={
                      v.status === "VERIFIED" ? "success" :
                      v.status === "REJECTED" ? "destructive" : "secondary"
                    }>{v.status}</Badge>
                    <span className="text-xs text-muted-foreground">{timeAgo(v.createdAt)}</span>
                  </div>
                  <p className="text-sm">
                    <strong>{v.user.name ?? v.user.email}</strong>
                    {" — "}
                    <span className="text-muted-foreground">{v.user.email} · {v.user.phone}</span>
                  </p>
                  {v.rejectionReason && (
                    <p className="text-xs text-destructive">Motif rejet : {v.rejectionReason}</p>
                  )}
                  {v.reviewedBy?.name && (
                    <p className="text-xs text-muted-foreground">Examiné par {v.reviewedBy.name}</p>
                  )}
                  {v.documentFrontUrl || v.selfieUrl ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        ...(v.documentFrontUrl ? [{ label: "Recto", url: v.documentFrontUrl }] : []),
                        ...(v.documentBackUrl ? [{ label: "Verso", url: v.documentBackUrl }] : []),
                        ...(v.selfieUrl ? [{ label: "Selfie", url: v.selfieUrl }] : []),
                      ].map((d) => (
                        <a
                          key={d.label}
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-secondary">
                            <Image src={d.url} alt={d.label} fill sizes="200px" className="object-cover" />
                          </div>
                          <p className="mt-1 text-center text-xs text-muted-foreground">{d.label}</p>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2 text-xs text-sky-300">
                      📨 Documents envoyés via Telegram — vérifiez la conversation, puis validez ici ou
                      depuis la fiche utilisateur.
                    </p>
                  )}
                </div>
                {v.status === "PENDING" && (
                  <VerificationActions verificationId={v.id} userId={v.user.id} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
