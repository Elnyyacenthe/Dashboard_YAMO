"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, UserPlus, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminCreateEscortAction, type AdminOnboardResult } from "@/lib/actions/admin-escort-onboarding";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let p = "";
  for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

export function OnboardForm() {
  const [showPwd, setShowPwd] = useState(false);
  const [generatedPwd, setGeneratedPwd] = useState("");
  const [tier, setTier] = useState<"STANDARD" | "PREMIUM" | "VIP">("STANDARD");
  const [state, formAction, pending] = useActionState<AdminOnboardResult | null, FormData>(
    adminCreateEscortAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(`Compte créé (UserId : ${state.userId}). Communiquez les identifiants à l'escorte.`);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  function fillRandomPwd() {
    const p = generatePassword();
    setGeneratedPwd(p);
    const input = document.getElementById("password") as HTMLInputElement | null;
    if (input) input.value = p;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="name">Nom / Pseudo de l'escorte *</Label>
          <Input id="name" name="name" required minLength={2} placeholder="Sandra" />
        </div>
        <div>
          <Label htmlFor="phone">Téléphone Cameroun *</Label>
          <Input id="phone" name="phone" required placeholder="+237 6XX XX XX XX" />
        </div>
      </div>

      <div>
        <Label htmlFor="email">Email *</Label>
        <Input id="email" name="email" type="email" required placeholder="sandra@example.com" />
      </div>

      <div>
        <Label htmlFor="password">Mot de passe *</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="password"
              name="password"
              type={showPwd ? "text" : "password"}
              required
              minLength={8}
              placeholder="Min. 8 caractères"
              defaultValue={generatedPwd}
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label="Toggle password visibility"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button type="button" variant="outline" onClick={fillRandomPwd}>
            Générer
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          ⚠️ Communiquez ce mot de passe à l'escorte de façon sécurisée. Elle pourra le changer après connexion.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="tier">Tier d'abonnement *</Label>
          <Select name="tier" defaultValue="STANDARD" onValueChange={(v) => setTier(v as typeof tier)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="STANDARD">Standard (2 500 FCFA/semaine)</SelectItem>
              <SelectItem value="PREMIUM">Premium (5 000 FCFA/mois)</SelectItem>
              <SelectItem value="VIP">VIP (15 000 FCFA/mois)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="months">Durée *</Label>
          {tier === "STANDARD" ? (
            <>
              <Input value="1 semaine (fixe)" disabled />
              <input type="hidden" name="months" value="1" />
            </>
          ) : (
            <Select name="months" defaultValue="1">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 mois</SelectItem>
                <SelectItem value="3">3 mois</SelectItem>
                <SelectItem value="6">6 mois</SelectItem>
                <SelectItem value="12">12 mois</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes internes (optionnel)</Label>
        <Textarea
          id="notes"
          name="notes"
          maxLength={500}
          rows={2}
          placeholder="Ex : Recommandée par X. A payé 5 000 FCFA cash le 24/06."
        />
      </div>

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Créer le compte + activer l'abonnement
      </Button>
    </form>
  );
}
