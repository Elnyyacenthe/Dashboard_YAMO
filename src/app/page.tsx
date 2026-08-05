import { redirect } from "next/navigation";

import { auth } from "@/auth";

/**
 * dashboard.affinité.com — back-office Affinité (admin + dev + service client).
 *
 * Pas d'espace public : tous les visiteurs sont redirigés
 *   - non connecté → /connexion
 *   - connecté admin → /admin
 *   - connecté non-admin → affinité.com
 */
export default async function DashboardRootPage() {
  const session = await auth();
  if (!session?.user) redirect("/connexion?callbackUrl=/admin");

  const role = session.user.role;
  if (role === "ADMIN" || role === "MODERATOR") {
    redirect("/admin");
  }

  // ESCORT/CLIENT n'ont rien à faire ici → renvoyer sur affinité.com
  const affiniteUrl = process.env.NEXT_PUBLIC_AFFINITE_URL ?? "https://affinité.com";
  redirect(affiniteUrl);
}
