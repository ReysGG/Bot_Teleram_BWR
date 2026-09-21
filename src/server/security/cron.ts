import { optionalEnv, requireEnv } from "@/server/env";
import { safeEqual } from "@/server/security/crypto";

export function verifyCronAuthorization(authorization: string | null): boolean {
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const configured = optionalEnv("APP_CRON_SECRET") ?? requireEnv("CRON_SECRET", 32);
  return safeEqual(token, configured);
}
