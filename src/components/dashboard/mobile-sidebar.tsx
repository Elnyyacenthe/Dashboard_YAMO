"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Barre + tiroir de navigation pour mobile/tablette — le `<aside>` desktop
 * reste caché en dessous de `md` (grille sidebar+contenu illisible en
 * colonne unique sur petit écran) et ce composant prend le relais.
 */
export function MobileSidebar({
  siteName,
  logoHref = "/",
  children,
}: {
  siteName: string;
  logoHref?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-border/60 bg-card/40 px-4 py-3 md:hidden">
        <Link href={logoHref} className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <Image src="/icon.svg" alt={siteName} width={26} height={26} />
          <span className="font-display text-lg font-bold gradient-text">{siteName}</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <Link href={logoHref} className="flex items-center gap-2" onClick={() => setOpen(false)}>
                <Image src="/icon.svg" alt={siteName} width={26} height={26} />
                <span className="font-display text-lg font-bold gradient-text">{siteName}</span>
              </Link>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Fermer le menu">
                <X className="h-5 w-5" />
              </Button>
            </div>
            {/* Ferme le tiroir après tout clic à l'intérieur (nav, logout…) */}
            <div onClick={() => setOpen(false)}>{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
