"use client";

import { useState, useTransition } from "react";
import { Loader2, Save, Gift } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateFreeTrialSettingsAction } from "@/lib/actions/free-trial-settings";

interface Values {
  enabled: boolean;
  days: number;
  tier: "STANDARD" | "PREMIUM" | "VIP";
}

export function FreeTrialSettingsForm({ defaultValues }: { defaultValues: Values }) {
  const [values, setValues] = useState<Values>(defaultValues);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateFreeTrialSettingsAction(values);
      if (res.ok) {
        toast.success(
          values.enabled
            ? `Essai gratuit activé : ${values.days} jours en ${values.tier}`
            : "Essai gratuit désactivé — les nouvelles inscriptions sont payantes",
        );
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <label
        htmlFor="ft-enabled"
        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-secondary/30 p-3"
      >
        <Checkbox
          id="ft-enabled"
          checked={values.enabled}
          onCheckedChange={(c) => setValues({ ...values, enabled: c === true })}
        />
        <span className="text-sm">
          <span className="font-medium">Offrir la période d&apos;essai aux nouvelles escortes</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Décoché = toute nouvelle inscription est payante immédiatement (comportement d&apos;avant).
            Les essais déjà en cours ne sont pas interrompus.
          </span>
        </span>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ft-days">Durée offerte (jours)</Label>
          <Input
            id="ft-days"
            type="number"
            min={1}
            max={365}
            value={values.days}
            disabled={!values.enabled}
            onChange={(e) => setValues({ ...values, days: Number(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground">30 = un mois offert.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ft-tier">Tier offert pendant l&apos;essai</Label>
          <Select
            value={values.tier}
            disabled={!values.enabled}
            onValueChange={(v) => setValues({ ...values, tier: v as Values["tier"] })}
          >
            <SelectTrigger id="ft-tier">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="STANDARD">Standard (1 annonce, 3 photos)</SelectItem>
              <SelectItem value="PREMIUM">Premium (3 annonces, 10 photos)</SelectItem>
              <SelectItem value="VIP">VIP (illimité, 50 photos)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Détermine les quotas d&apos;annonces et de photos pendant l&apos;essai.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </Button>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Gift className="h-3.5 w-3.5" />
          {values.enabled
            ? `Une nouvelle escorte publie gratuitement pendant ${values.days} jour${values.days > 1 ? "s" : ""}, puis doit payer.`
            : "Aucun essai offert."}
        </span>
      </div>
    </div>
  );
}
