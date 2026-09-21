import { getSmsPoolServices, type SmsPoolService } from "./client";
const TTL_MS = 5 * 60_000;
let cached: { expiresAt: number; services: SmsPoolService[] } | null = null;
let active: Promise<SmsPoolService[]> | null = null;

/** Public service metadata only. Quotes, balances and purchase checks stay fresh. */
export function getCachedSmsPoolServices(): Promise<SmsPoolService[]> {
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.services);
  if (active) return active;
  const run = getSmsPoolServices().then(services => {
    cached = { services, expiresAt: Date.now() + TTL_MS };
    return services;
  }).finally(() => { if (active === run) active = null; });
  active = run;
  return run;
}
