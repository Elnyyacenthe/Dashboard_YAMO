import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { LayoutDashboard, Users, ListChecks, Flag, CreditCard, BarChart3, Settings, BadgeCheck, Wallet, DollarSign, MapPin, MessageSquare } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "@/components/auth/logout-button";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { MobileSidebar } from "@/components/dashboard/mobile-sidebar";
import { Separator } from "@/components/ui/separator";
import { SITE_NAME } from "@/lib/utils";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/connexion");
  if (session.user.role !== "ADMIN" && session.user.role !== "MODERATOR") {
    redirect("/");
  }

  // Compteurs pour les badges sidebar (cache courte durée)
  const [pendingAds, openReports, pendingVerifs, pendingWithdrawals, openTickets, pendingPayments] = await Promise.all([
    prisma.ad.count({ where: { status: "PENDING" } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.idVerification.count({ where: { status: "PENDING" } }),
    prisma.withdrawalRequest.count({ where: { status: "PENDING" } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "WAITING_USER"] } } }),
    prisma.payment.count({ where: { status: "PENDING" } }),
  ]);

  const navContent = (
    <div className="space-y-2 p-4">
      <p className="px-3 text-xs font-semibold uppercase text-muted-foreground">Administration</p>
      <SidebarNav
        items={[
          { href: "/admin", label: "Vue d'ensemble", icon: <LayoutDashboard className="h-4 w-4" /> },
          { href: "/admin/moderation", label: "Modération", icon: <ListChecks className="h-4 w-4" />, badge: pendingAds },
          { href: "/admin/moderation/doublons-photos", label: "Doublons photos", icon: <ListChecks className="h-4 w-4" /> },
          { href: "/admin/verifications", label: "Vérifications ID", icon: <BadgeCheck className="h-4 w-4" />, badge: pendingVerifs },
          { href: "/admin/annonces", label: "Toutes les annonces", icon: <ListChecks className="h-4 w-4" /> },
          { href: "/admin/utilisateurs", label: "Utilisateurs", icon: <Users className="h-4 w-4" /> },
          { href: "/admin/escortes-onboarding", label: "✨ Onboarding escort", icon: <Users className="h-4 w-4" /> },
          { href: "/admin/villes", label: "Villes", icon: <MapPin className="h-4 w-4" /> },
          { href: "/admin/signalements", label: "Signalements", icon: <Flag className="h-4 w-4" />, badge: openReports },
          { href: "/admin/paiements", label: "Paiements", icon: <CreditCard className="h-4 w-4" />, badge: pendingPayments },
          { href: "/admin/retraits", label: "Retraits", icon: <Wallet className="h-4 w-4" />, badge: pendingWithdrawals },
          { href: "/admin/tarifs", label: "Tarifs & Bonus", icon: <DollarSign className="h-4 w-4" /> },
          { href: "/admin/support", label: "Service client", icon: <MessageSquare className="h-4 w-4" />, badge: openTickets },
          { href: "/admin/statistiques", label: "Statistiques", icon: <BarChart3 className="h-4 w-4" /> },
          { href: "/admin/statistiques/revenus", label: "Revenus 📈", icon: <DollarSign className="h-4 w-4" /> },
          { href: "/admin/reglages", label: "Réglages", icon: <Settings className="h-4 w-4" /> },
        ]}
      />
      <Separator className="my-4" />
      <LogoutButton variant="button" />
    </div>
  );

  return (
    <div className="grid min-h-screen md:grid-cols-[260px_1fr]">
      <MobileSidebar siteName={`${SITE_NAME} Admin`}>{navContent}</MobileSidebar>

      <aside className="hidden border-b border-border/60 bg-gradient-to-b from-card to-background md:block md:border-b-0 md:border-r">
        <div className="flex h-16 items-center px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/icon.svg" alt={SITE_NAME} width={28} height={28} priority />
            <span className="font-display text-xl font-bold gradient-text">{SITE_NAME} Admin</span>
          </Link>
        </div>
        <Separator />
        {navContent}
      </aside>
      <main className="p-4 sm:p-6 md:p-10">{children}</main>
    </div>
  );
}
