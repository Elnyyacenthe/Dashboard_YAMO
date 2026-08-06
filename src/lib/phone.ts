/**
 * Utilitaires téléphone Cameroun — module pur (pas d'import Node-only),
 * safe à importer côté client ET serveur.
 */

/** Normalise un numéro Cameroun en format international sans "+" : 237XXXXXXXXX. */
export function normalizeCameroonPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("237") && digits.length === 12) return digits;
  if (digits.startsWith("6") && digits.length === 9) return "237" + digits;
  if (digits.length === 9) return "237" + digits;
  return digits;
}
