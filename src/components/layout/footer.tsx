import Link from "next/link";
import { Flame, ShieldAlert, ExternalLink } from "lucide-react";
import { SITE_NAME } from "@/lib/utils";

const AFFINITE_URL_BASE = process.env.NEXT_PUBLIC_AFFINITE_URL ?? "https://affinité.com";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border/40 bg-card/30">
      <div className="container py-12">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <Flame className="h-6 w-6 text-primary" />
              <span className="font-display text-xl font-bold gradient-text">{SITE_NAME}</span>
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Dashboard
              </span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              Interface de gestion {SITE_NAME}. Espace réservé aux escorts, clients, modérateurs et
              administrateurs.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
              <ShieldAlert className="h-3.5 w-3.5" /> 18+ UNIQUEMENT
            </div>
          </div>

          <div>
            <h4 className="mb-3 font-semibold">Site public</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href={AFFINITE_URL_BASE} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                  <ExternalLink className="mr-1 inline h-3 w-3" /> Accueil affinité.com
                </a>
              </li>
              <li>
                <a href={`${AFFINITE_URL_BASE}/recherche`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                  <ExternalLink className="mr-1 inline h-3 w-3" /> Recherche d'annonces
                </a>
              </li>
              <li>
                <a href={`${AFFINITE_URL_BASE}/tarifs`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                  <ExternalLink className="mr-1 inline h-3 w-3" /> Tarifs Premium
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 font-semibold">Légal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/mentions-legales">Mentions légales</Link></li>
              <li><Link href="/cgu">Conditions d'utilisation</Link></li>
              <li><Link href="/confidentialite">Politique de confidentialité</Link></li>
              <li><Link href="/rgpd">RGPD</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border/40 pt-6 text-center text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} {SITE_NAME}. Interface back-office. Site réservé aux
            personnes majeures.
          </p>
        </div>
      </div>
    </footer>
  );
}
