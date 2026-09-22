import { z } from "zod";
import { integerEnv, optionalEnv, requireEnv } from "@/server/env";

const SMSPOOL_BASE_URL = "https://api.smspool.net";
export const SMSPOOL_UNAVAILABLE_MESSAGE =
  "Layanan SMS sedang maintenance atau sementara tidak tersedia. Silakan coba lagi nanti.";
export const SMSPOOL_NO_NUMBERS_MESSAGE =
  "Nomor tidak tersedia untuk aplikasi dan negara ini. Silakan pilih negara atau aplikasi lain.";
export const SMSPOOL_CANCEL_PENDING_MESSAGE =
  "Nomor ini belum dapat dibatalkan. Tunggu sekitar 1 menit lalu coba lagi.";
const SENSITIVE_PROVIDER_ERROR =
  /(?:insufficient|not enough|low|minimum).{0,30}(?:balance|credit|funds?)|(?:balance|credit|funds?).{0,30}(?:insufficient|not enough|low|minimum)|saldo|top[ -]?up/i;
const NO_NUMBERS_PROVIDER_ERROR =
  /no\s+(?:phone\s+)?numbers?|numbers?\s+(?:are\s+)?(?:not|un)available|couldn.?t\s+find\s+an?\s+available\s+(?:phone\s+)?number|out\s+of\s+stock|sold\s+out|no\s+inventory|currently\s+unavailable|no\s+stock/i;

const countrySchema = z.object({
  ID: z.coerce.number().int().nonnegative(),
  name: z.string(),
  short_name: z.string(),
  region: z.string().optional().default(""),
});

const serviceSchema = z.object({
  ID: z.coerce.number().int().nonnegative(),
  name: z.string(),
  favourite: z.coerce.number().optional().default(0),
});

const poolSchema = z.object({
  ID: z.coerce.number().int().nonnegative(),
  name: z.string(),
});

const successRateSchema = z.object({
  country: z.coerce.number().int().nonnegative().optional(),
  country_id: z.coerce.number().int().nonnegative(),
  name: z.string(),
  short_name: z.string(),
  success_rate: z.coerce.number().nonnegative().optional().default(0),
  price: z.coerce.number().nonnegative(),
  low_price: z.coerce.number().nonnegative(),
});

const smsOrderSchema = z.object({
  timestamp: z.string().optional().default(""),
  cost: z.coerce.string().optional().default("0"),
  order_code: z.string(),
  phonenumber: z.coerce.string(),
  code: z.coerce.string().optional().default("0"),
  full_code: z.string().nullable().optional().default(""),
  short_name: z.string().optional().default(""),
  service: z.string().optional().default(""),
  status: z.string().optional().default("unknown"),
  pool: z.union([z.string(), z.number()]).optional(),
  expiry: z.coerce.number().optional().default(0),
  time_left: z.coerce.number().optional().default(0),
  completed_on: z.string().nullable().optional(),
});

const purchaseSchema = z.object({
  success: z.literal(1),
  number: z.union([z.string(), z.number()]).optional(),
  cc: z.coerce.string().optional().default(""),
  phonenumber: z.coerce.string(),
  order_id: z.string(),
  country: z.string().optional().default(""),
  service: z.string().optional().default(""),
  pool: z.union([z.string(), z.number()]).optional(),
  expires_in: z.coerce.number().optional().default(0),
  expiration: z.coerce.number().optional().default(0),
  cost: z.coerce.string().optional().default("0"),
  cost_in_cents: z.coerce.number().optional(),
  message: z.string().optional(),
});

const smsCheckSchema = z.object({
  status: z.coerce.number().int(),
  sms: z.coerce.string().optional().default(""),
  full_sms: z.string().nullable().optional().default(""),
  message: z.string().optional(),
  expiration: z.coerce.number().optional().default(0),
  time_left: z.coerce.number().optional().default(0),
});

export type SmsPoolCountry = z.infer<typeof countrySchema>;
export type SmsPoolService = z.infer<typeof serviceSchema>;
export type SmsPoolPool = z.infer<typeof poolSchema>;
export type SmsPoolOrder = z.infer<typeof smsOrderSchema>;
export type SmsPoolPurchase = z.infer<typeof purchaseSchema>;
export type SmsPoolCheck = z.infer<typeof smsCheckSchema>;
export type SmsPoolSuccessRate = z.infer<typeof successRateSchema>;
export type SmsPoolCountryCategory = "cheap" | "success";

const FEATURED_SERVICE_KEYWORDS = [
  "openai",
  "chatgpt",
  "claude",
  "anthropic",
  "gemini",
  "google bard",
  "perplexity",
  "deepseek",
  "grok",
  "xai",
  "copilot",
  "character ai",
  "poe",
  "midjourney",
  "tokopedia",
  "shopee",
  "gojek",
  "gopay",
  "grab",
  "traveloka",
  "bukalapak",
  "blibli",
  "lazada",
  "dana",
  "ovo",
  "linkaja",
  "jenius",
  "kredivo",
  "akulaku",
  "tiket",
  "ruangguru",
] as const;

function normalizeServiceName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function smsPoolFeaturedServiceRank(serviceName: string) {
  const normalized = normalizeServiceName(serviceName);
  const rank = FEATURED_SERVICE_KEYWORDS.findIndex((keyword) =>
    normalized.includes(keyword),
  );
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

export function isSmsPoolFeaturedService(serviceName: string) {
  return smsPoolFeaturedServiceRank(serviceName) !== Number.MAX_SAFE_INTEGER;
}

export function sortSmsPoolFeaturedServices(services: SmsPoolService[]) {
  return services
    .filter((service) => isSmsPoolFeaturedService(service.name))
    .sort((left, right) =>
      smsPoolFeaturedServiceRank(left.name) - smsPoolFeaturedServiceRank(right.name) ||
      right.favourite - left.favourite ||
      left.name.localeCompare(right.name),
    );
}

export class SmsPoolApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SmsPoolApiError";
  }
}

export function smsPoolConfigured() {
  return Boolean(optionalEnv("SMSPOOL_API_KEY"));
}

export function getSmsPoolPricing() {
  return {
    usdToIdrRate: integerEnv("SMSPOOL_USD_TO_IDR_RATE", 18_500),
    serviceFeeIdr: integerEnv("SMSPOOL_SERVICE_FEE_IDR", 2_000),
  };
}

export function calculateSmsPoolSellPrice(providerCostUsd: number | string) {
  const providerCost = Number(providerCostUsd);
  if (!Number.isFinite(providerCost) || providerCost < 0) {
    throw new Error("Invalid SMSPool provider cost");
  }
  const pricing = getSmsPoolPricing();
  return Math.ceil(providerCost * pricing.usdToIdrRate) + pricing.serviceFeeIdr;
}

export function smsPoolProviderPriceCeiling(input: {
  price: number;
  low_price: number;
}) {
  return Math.max(input.price, input.low_price);
}

export function smsPoolProviderPriceFloor(input: {
  price: number;
  low_price: number;
}) {
  const available = [input.low_price, input.price].filter((price) => price > 0);
  return available.length ? Math.min(...available) : 0;
}

export function sortSmsPoolCountries(
  countries: SmsPoolSuccessRate[],
  category: SmsPoolCountryCategory,
) {
  return [...countries].sort((left, right) => {
    if (category === "success") {
      return right.success_rate - left.success_rate ||
        smsPoolProviderPriceFloor(left) - smsPoolProviderPriceFloor(right) ||
        left.name.localeCompare(right.name);
    }
    return smsPoolProviderPriceFloor(left) - smsPoolProviderPriceFloor(right) ||
      right.success_rate - left.success_rate ||
      left.name.localeCompare(right.name);
  });
}

export function selectSmsPoolQuickCountries(
  countries: SmsPoolSuccessRate[],
  defaultCountryId = 9,
) {
  const available = countries.filter(
    (country) => smsPoolProviderPriceFloor(country) > 0,
  );
  if (available.length === 0) return [];

  const cheapest = sortSmsPoolCountries(available, "cheap")[0];
  const mostSuccessful = sortSmsPoolCountries(available, "success")[0];
  const defaultCountry = available.find(
    (country) =>
      country.country_id === defaultCountryId ||
      country.short_name.toUpperCase() === "ID",
  ) ?? cheapest;
  const selected = new Set<number>();
  const result: Array<{
    kind: "default" | "cheap" | "success";
    country: SmsPoolSuccessRate;
  }> = [];

  for (const entry of [
    { kind: "default" as const, country: defaultCountry },
    { kind: "cheap" as const, country: cheapest },
    { kind: "success" as const, country: mostSuccessful },
  ]) {
    if (selected.has(entry.country.country_id)) continue;
    selected.add(entry.country.country_id);
    result.push(entry);
  }
  return result;
}

function normalizeCountrySearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]+/g, "");
}

const COUNTRY_SEARCH_ALIASES: Record<string, string[]> = {
  GB: ["uk", "england", "britain", "inggris"],
  ID: ["indo"],
  US: ["usa", "america", "amerika"],
};

export function matchesSmsPoolCountry(
  country: Pick<SmsPoolSuccessRate, "country_id" | "name" | "short_name">,
  query: string,
): boolean {
  const needle = normalizeCountrySearch(query);
  if (!needle) return true;
  const aliases = COUNTRY_SEARCH_ALIASES[country.short_name.toUpperCase()] ?? [];
  const searchable = normalizeCountrySearch([
    country.name,
    country.short_name,
    String(country.country_id),
    ...aliases,
  ].join(" "));
  return searchable.includes(needle);
}

export function resolveSmsPoolPurchaseCostUsd(
  purchase: Pick<SmsPoolPurchase, "cost" | "cost_in_cents">,
  fallbackCostUsd: number,
) {
  const cents = purchase.cost_in_cents;
  if (Number.isFinite(cents) && Number(cents) > 0) return Number(cents) / 100;
  const cost = Number(purchase.cost);
  return Number.isFinite(cost) && cost > 0 ? cost : fallbackCostUsd;
}

function providerMessage(value: unknown): string {
  if (!value || typeof value !== "object") return SMSPOOL_UNAVAILABLE_MESSAGE;
  const record = value as Record<string, unknown>;
  const providerType = typeof record.type === "string" ? record.type : "";
  if (providerType.toUpperCase() === "OUT_OF_STOCK") {
    return SMSPOOL_NO_NUMBERS_MESSAGE;
  }
  const direct = typeof record.message === "string" ? record.message : "";
  const nested = Array.isArray(record.errors)
    ? record.errors.find((item) => item && typeof item === "object")
    : null;
  const nestedMessage =
    nested && typeof (nested as Record<string, unknown>).message === "string"
      ? String((nested as Record<string, unknown>).message)
      : "";
  const message = (direct || nestedMessage || SMSPOOL_UNAVAILABLE_MESSAGE)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  if (NO_NUMBERS_PROVIDER_ERROR.test(message)) return SMSPOOL_NO_NUMBERS_MESSAGE;
  if (/cannot be cancelled yet|can.?t be cancelled yet/i.test(message)) {
    return SMSPOOL_CANCEL_PENDING_MESSAGE;
  }
  if (SENSITIVE_PROVIDER_ERROR.test(message)) return SMSPOOL_UNAVAILABLE_MESSAGE;
  return message;
}

async function requestJson(
  path: string,
  input?: {
    method?: "GET" | "POST";
    fields?: Record<string, string | number | undefined>;
    authenticated?: boolean;
  },
) {
  const method = input?.method ?? "POST";
  const authenticated = input?.authenticated ?? true;
  const body = method === "POST" ? new FormData() : undefined;
  if (body && authenticated) body.set("key", requireEnv("SMSPOOL_API_KEY", 32));
  if (body) {
    for (const [key, value] of Object.entries(input?.fields ?? {})) {
      if (value !== undefined && String(value).trim() !== "") {
        body.set(key, String(value));
      }
    }
  }

  let response: Response;
  try {
    response = await fetch(`${SMSPOOL_BASE_URL}${path}`, {
      method,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(integerEnv("SMSPOOL_TIMEOUT_MS", 15_000)),
    });
  } catch {
    throw new SmsPoolApiError("SMSPool tidak dapat dihubungi", 503);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || (payload && typeof payload === "object" && "success" in payload && (payload as { success?: unknown }).success === 0)) {
    throw new SmsPoolApiError(providerMessage(payload), response.status);
  }
  return payload;
}

export async function getSmsPoolBalance(): Promise<number> {
  const payload = await requestJson("/request/balance");
  const parsed = z.object({ balance: z.coerce.number() }).parse(payload);
  return parsed.balance;
}

export async function getSmsPoolCountries(): Promise<SmsPoolCountry[]> {
  return z.array(countrySchema).parse(
    await requestJson("/country/retrieve_all", { method: "GET", authenticated: false }),
  );
}

export async function getSmsPoolServices(): Promise<SmsPoolService[]> {
  return z.array(serviceSchema).parse(
    await requestJson("/service/retrieve_all", { method: "GET", authenticated: false }),
  );
}

export async function getSmsPoolPools(): Promise<SmsPoolPool[]> {
  return z.array(poolSchema).parse(
    await requestJson("/pool/retrieve_all", { authenticated: false }),
  );
}

export async function getSmsPoolSuccessRates(
  service: string | number,
): Promise<SmsPoolSuccessRate[]> {
  return z.array(successRateSchema).parse(
    await requestJson("/request/success_rate", {
      fields: { service },
      authenticated: false,
    }),
  );
}

export async function getSmsPoolActiveOrders(): Promise<SmsPoolOrder[]> {
  return z.array(smsOrderSchema).parse(await requestJson("/request/active"));
}

export async function getSmsPoolHistory(length = 50): Promise<SmsPoolOrder[]> {
  return z.array(smsOrderSchema).parse(
    await requestJson("/request/history", {
      fields: { start: 0, length: Math.min(Math.max(length, 1), 100) },
    }),
  );
}

export async function checkSmsPoolOrder(orderId: string): Promise<SmsPoolCheck> {
  return smsCheckSchema.parse(
    await requestJson("/sms/check", { fields: { orderid: orderId } }),
  );
}

export async function purchaseSmsPoolNumber(input: {
  country: string;
  service: string;
  pool?: string;
  maxPrice?: string;
  pricingOption: "0" | "1";
  quantity: number;
}) {
  const payload = await requestJson("/purchase/sms", {
    fields: {
      country: input.country,
      service: input.service,
      pool: input.pool,
      max_price: input.maxPrice,
      pricing_option: input.pricingOption,
      quantity: input.quantity,
      create_token: 0,
      activation_type: "SMS",
    },
  });
  return purchaseSchema.parse(payload);
}

export async function cancelSmsPoolOrder(orderId: string) {
  const payload = await requestJson("/sms/cancel", {
    fields: { orderid: orderId },
  });
  return z.object({ success: z.literal(1), message: z.string().optional() }).parse(payload);
}
