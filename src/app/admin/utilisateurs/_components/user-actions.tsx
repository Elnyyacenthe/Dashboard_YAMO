"use client";

import { useTransition } from "react";
import { Ban, ShieldCheck, BadgeCheck, BadgeX, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@prisma/client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toggleUserBanAction, setUserRoleAction, setProfileVerifiedAction } from "@/lib/actions/admin";

interface Props {
  userId: string;
  profileId: string | null;
  isBanned: boolean;
  isVerified: boolean;
  currentRole: Role;
  /** Changer le rôle d'un compte est réservé ADMIN — un MODERATOR ne voit pas l'option. */
  canChangeRole: boolean;
}

export function UserActions({ userId, profileId, isBanned, isVerified, currentRole, canChangeRole }: Props) {
  const [pending, startTransition] = useTransition();

  function toggleBan() {
    const reason = isBanned ? undefined : prompt("Motif du bannissement ?");
    if (!isBanned && !reason) return;
    startTransition(async () => {
      await toggleUserBanAction(userId, reason ?? undefined);
      toast.success(isBanned ? "Utilisateur débanni" : "Utilisateur banni");
    });
  }

  function changeRole(role: Role) {
    if (!confirm(`Changer le rôle en ${role} ?`)) return;
    startTransition(async () => {
      try {
        await setUserRoleAction(userId, role);
        toast.success("Rôle modifié");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function toggleVerify() {
    if (!profileId) return toast.error("Profil escort inexistant");
    startTransition(async () => {
      await setProfileVerifiedAction(profileId, !isVerified);
      toast.success(isVerified ? "Vérification retirée" : "Profil vérifié");
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" disabled={pending}>
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "•••"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {profileId && (
          <DropdownMenuItem onClick={toggleVerify}>
            {isVerified ? (
              <>
                <BadgeX className="h-4 w-4" /> Retirer vérification
              </>
            ) : (
              <>
                <BadgeCheck className="h-4 w-4" /> Marquer vérifié
              </>
            )}
          </DropdownMenuItem>
        )}
        {canChangeRole && (["CLIENT", "ESCORT", "MODERATOR", "ADMIN"] as Role[]).map((r) => (
          <DropdownMenuItem
            key={r}
            disabled={r === currentRole}
            onClick={() => changeRole(r)}
          >
            <ShieldCheck className="h-4 w-4" /> Définir rôle : {r}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={toggleBan} className="text-destructive">
          <Ban className="h-4 w-4" /> {isBanned ? "Débannir" : "Bannir"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
