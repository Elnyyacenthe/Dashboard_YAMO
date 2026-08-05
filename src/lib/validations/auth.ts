import { z } from "zod";

// +237 6XX XX XX XX (Cameroun) ou format international
export const PHONE_REGEX = /^(\+237|237)?[\s-]?6\d{8}$/;

/** Pseudo compte CLIENT allégé (cf. clientQuickAuthAction) — pas d'email/téléphone requis. */
export const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{2,30}$/;

export const signInSchema = z.object({
  identifier: z
    .string()
    .min(1, "Identifiant requis")
    .refine(
      (v) =>
        /^\S+@\S+\.\S+$/.test(v) ||
        PHONE_REGEX.test(v.replace(/\s/g, "")) ||
        USERNAME_REGEX.test(v),
      "Identifiant invalide",
    ),
  password: z.string().min(8, "8 caractères minimum"),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    name: z.string().min(2, "Nom trop court").max(80),
    email: z.string().email("Email invalide"),
    phone: z
      .string()
      .min(9, "Téléphone requis")
      .refine((v) => PHONE_REGEX.test(v.replace(/\s/g, "")), "Numéro Cameroun invalide (ex: +237 6XX XX XX XX)"),
    password: z.string().min(8, "8 caractères minimum").max(128),
    confirmPassword: z.string(),
    role: z.enum(["CLIENT", "ESCORT"]),
    /** Tier sélectionné à l'inscription (escort uniquement, sinon ignoré). */
    tier: z.enum(["STANDARD", "PREMIUM", "VIP"]).default("STANDARD"),
    /** Code parrainage optionnel (AFF-XXXX). */
    referralCode: z.string().trim().toUpperCase().optional(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: "Vous devez accepter les CGU" }) }),
    acceptAdult: z.literal(true, { errorMap: () => ({ message: "Vous devez confirmer avoir 18+ ans" }) }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });
export type SignUpInput = z.infer<typeof signUpSchema>;
