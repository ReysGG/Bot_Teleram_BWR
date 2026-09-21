import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { booleanEnv, optionalEnv } from "@/server/env";

const STORE_RUNTIME_ID = "global";
export const DEFAULT_BINANCE_API_BASE_URL = "https://api.binance.com";

export type BinanceInternalSettingClient = Pick<
  Prisma.TransactionClient,
  "storeRuntimeSetting" | "binanceWebSession"
>;

export type BinanceInternalVerifierMode =
  | "WEB_SESSION"
  | "OFFICIAL_API"
  | "NONE";

export function normalizeBinanceRecipientId(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  if (!/^\d{5,32}$/.test(normalized)) {
    throw new Error("Binance ID harus berisi 5-32 digit.");
  }
  return normalized;
}

export function getBinanceApiConfiguration() {
  const apiKey = optionalEnv("BINANCE_API_KEY");
  const apiSecret = optionalEnv("BINANCE_API_SECRET");
  return {
    configured: Boolean(apiKey && apiSecret),
    baseUrl: optionalEnv("BINANCE_API_BASE_URL") ?? DEFAULT_BINANCE_API_BASE_URL,
    source: optionalEnv("BINANCE_API_BASE_URL")
      ? ("ENV" as const)
      : ("DEFAULT" as const),
  };
}

export function requireBinanceApiCredentials() {
  const apiKey = optionalEnv("BINANCE_API_KEY");
  const apiSecret = optionalEnv("BINANCE_API_SECRET");
  if (!apiKey || !apiSecret) {
    throw new Error("Binance Pay API belum dikonfigurasi.");
  }
  return {
    apiKey,
    apiSecret,
    baseUrl: optionalEnv("BINANCE_API_BASE_URL") ?? DEFAULT_BINANCE_API_BASE_URL,
  };
}

async function getBinanceWebConfiguration(
  client: BinanceInternalSettingClient,
  recipientId: string | null,
) {
  const checkoutEnabled = booleanEnv(
    "BINANCE_WEB_SESSION_CHECKOUT_ENABLED",
    false,
  );
  const autoConfirmEnabled = booleanEnv(
    "BINANCE_WEB_SESSION_AUTO_CONFIRM",
    false,
  );
  const webSessionClient = "binanceWebSession" in client
    ? client.binanceWebSession
    : null;
  const session = recipientId && webSessionClient
    ? await webSessionClient.findFirst({
        where: {
          recipientBinanceId: recipientId,
          status: "ACTIVE",
          isPrimary: true,
          accountFingerprint: { not: null },
          encryptedCookieJar: { not: null },
          lastValidatedAt: { not: null },
        },
        select: {
          id: true,
          name: true,
          accountFingerprint: true,
          lastValidatedAt: true,
          lastSuccessfulPollAt: true,
        },
      })
    : null;
  return {
    checkoutEnabled,
    autoConfirmEnabled,
    ready: checkoutEnabled && Boolean(session?.accountFingerprint),
    sessionId: session?.id ?? null,
    sessionName: session?.name ?? null,
    accountFingerprint: session?.accountFingerprint ?? null,
    lastValidatedAt: session?.lastValidatedAt ?? null,
    lastSuccessfulPollAt: session?.lastSuccessfulPollAt ?? null,
  };
}

export async function getBinanceInternalSetting(
  client: BinanceInternalSettingClient = prisma,
) {
  const setting = await client.storeRuntimeSetting.findUnique({
    where: { id: STORE_RUNTIME_ID },
    select: {
      binanceInternalEnabled: true,
      binanceInternalRecipientId: true,
      binanceInternalUpdatedAt: true,
      binanceInternalUpdatedBy: true,
    },
  });
  const envRecipientId = optionalEnv("BINANCE_PAY_RECIPIENT_ID");
  const recipientId = setting?.binanceInternalRecipientId ??
    (envRecipientId ? normalizeBinanceRecipientId(envRecipientId) : null);
  const [api, web] = await Promise.all([
    Promise.resolve(getBinanceApiConfiguration()),
    getBinanceWebConfiguration(client, recipientId),
  ]);
  const verifierMode: BinanceInternalVerifierMode = web.ready
    ? "WEB_SESSION"
    : api.configured
      ? "OFFICIAL_API"
      : "NONE";
  return {
    enabled: setting?.binanceInternalEnabled ?? false,
    recipientId,
    recipientSource: setting?.binanceInternalRecipientId
      ? ("DATABASE" as const)
      : envRecipientId
        ? ("ENV" as const)
        : ("NONE" as const),
    api,
    web,
    verifierMode,
    verifierReady: verifierMode !== "NONE",
    updatedAt: setting?.binanceInternalUpdatedAt ?? null,
    updatedBy: setting?.binanceInternalUpdatedBy ?? null,
  };
}

export async function setBinanceInternalSetting(
  input: { enabled: boolean; recipientId?: string | null; actor: string },
  client: BinanceInternalSettingClient = prisma,
) {
  const recipientId = input.recipientId?.trim()
    ? normalizeBinanceRecipientId(input.recipientId)
    : null;
  if (input.enabled && !recipientId && !optionalEnv("BINANCE_PAY_RECIPIENT_ID")) {
    throw new Error("Binance ID penerima wajib diisi sebelum pembayaran diaktifkan.");
  }
  if (input.enabled) {
    const apiReady = getBinanceApiConfiguration().configured;
    const web = await getBinanceWebConfiguration(
      client,
      recipientId ?? normalizeBinanceRecipientId(optionalEnv("BINANCE_PAY_RECIPIENT_ID")),
    );
    if (!apiReady && !web.ready) {
      throw new Error(
        "Konfigurasikan API read-only atau session web Binance yang aktif sebelum pembayaran diaktifkan.",
      );
    }
  }
  const updatedAt = new Date();
  return client.storeRuntimeSetting.upsert({
    where: { id: STORE_RUNTIME_ID },
    create: {
      id: STORE_RUNTIME_ID,
      binanceInternalEnabled: input.enabled,
      binanceInternalRecipientId: recipientId,
      binanceInternalUpdatedAt: updatedAt,
      binanceInternalUpdatedBy: input.actor,
    },
    update: {
      binanceInternalEnabled: input.enabled,
      binanceInternalRecipientId: recipientId,
      binanceInternalUpdatedAt: updatedAt,
      binanceInternalUpdatedBy: input.actor,
    },
  });
}
