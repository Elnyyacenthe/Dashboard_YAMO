"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateManualPaymentSettingsAction } from "@/lib/actions/manual-payment-settings";

interface Values {
  recipientName: string;
  mtnNumber: string;
  orangeNumber: string;
  instructions: string;
}

export function ManualPaymentSettingsForm({ defaultValues }: { defaultValues: Values }) {
  const [values, setValues] = useState(defaultValues);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateManualPaymentSettingsAction(values);
      if (res.ok) toast.success("Coordonnées mises à jour");
      else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="mp-name">Nom du titulaire</Label>
        <Input
          id="mp-name"
          value={values.recipientName}
          onChange={(e) => setValues({ ...values, recipientName: e.target.value })}
          placeholder="Ex : Jean K."
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mp-mtn">Numéro MTN Mobile Money</Label>
        <Input
          id="mp-mtn"
          value={values.mtnNumber}
          onChange={(e) => setValues({ ...values, mtnNumber: e.target.value })}
          placeholder="6XX XXX XXX"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mp-orange">Numéro Orange Money</Label>
        <Input
          id="mp-orange"
          value={values.orangeNumber}
          onChange={(e) => setValues({ ...values, orangeNumber: e.target.value })}
          placeholder="6XX XXX XXX"
        />
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="mp-instructions">Instructions complémentaires (optionnel)</Label>
        <Textarea
          id="mp-instructions"
          value={values.instructions}
          onChange={(e) => setValues({ ...values, instructions: e.target.value })}
          placeholder="Ex : envoyez le montant exact et gardez le SMS de confirmation."
        />
      </div>
      <div className="md:col-span-2">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
