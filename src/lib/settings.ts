import { prisma } from "@/lib/prisma";

export async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const setting = await prisma.siteSetting.findUnique({ where: { key } });
  if (!setting) return fallback;
  const n = Number(setting.value);
  return Number.isFinite(n) ? n : fallback;
}

export async function getSettingString(key: string, fallback: string): Promise<string> {
  const setting = await prisma.siteSetting.findUnique({ where: { key } });
  return setting?.value ?? fallback;
}

/**
 * Lit un booléen dans SiteSetting ("true"/"1"/"on"/"yes" = vrai).
 * Si la clé n'existe pas, retourne `fallback`.
 */
export async function getSettingBool(key: string, fallback: boolean): Promise<boolean> {
  const setting = await prisma.siteSetting.findUnique({ where: { key } });
  if (!setting) return fallback;
  return ["true", "1", "on", "yes"].includes(setting.value.trim().toLowerCase());
}
