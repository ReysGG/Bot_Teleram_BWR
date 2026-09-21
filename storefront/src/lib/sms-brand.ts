import { smsBrandLogos } from "./sms-brand-logos";
export function normalizedSmsBrand(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function smsBrandLogo(name: string): string | null {
  const aliases: Record<string, string> = { openai: "openaichatgpt", chatgpt: "openaichatgpt", google: "googlegmail", gmail: "googlegmail" };
  const normalized = normalizedSmsBrand(name);
  const key = Object.hasOwn(smsBrandLogos, normalized) ? normalized : Object.hasOwn(aliases, normalized) ? aliases[normalized] : normalized;
  if (!Object.hasOwn(smsBrandLogos, key)) return null;
  const value = smsBrandLogos[key];
  return typeof value === "string" && value.startsWith("/sms/brands/") ? value : null;
}
