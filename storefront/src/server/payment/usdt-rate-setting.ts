import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  DEFAULT_USDT_IDR_RATE,
  normalizeUsdtIdrRate,
} from "@/server/payment/usdt-amount";

const STORE_RUNTIME_ID = "global";
export const USDT_RATE_SOURCE = "ADMIN_MANUAL";

export type UsdtRateSettingClient = Pick<
  Prisma.TransactionClient,
  "storeRuntimeSetting"
>;

export async function getUsdtRateSetting(
  client: UsdtRateSettingClient = prisma,
) {
  const setting = await client.storeRuntimeSetting.findUnique({
    where: { id: STORE_RUNTIME_ID },
    select: {
      usdtIdrRate: true,
      usdtIdrRateSource: true,
      usdtIdrRateUpdatedAt: true,
      usdtIdrRateUpdatedBy: true,
    },
  });
  return {
    rate: setting?.usdtIdrRate ?? DEFAULT_USDT_IDR_RATE,
    source: setting?.usdtIdrRateSource ?? USDT_RATE_SOURCE,
    updatedAt: setting?.usdtIdrRateUpdatedAt ?? null,
    updatedBy: setting?.usdtIdrRateUpdatedBy ?? null,
  };
}

export async function setUsdtRateSetting(
  input: { rate: number; actor: string },
  client: UsdtRateSettingClient = prisma,
) {
  const rate = normalizeUsdtIdrRate(input.rate);
  const updatedAt = new Date();
  return client.storeRuntimeSetting.upsert({
    where: { id: STORE_RUNTIME_ID },
    create: {
      id: STORE_RUNTIME_ID,
      usdtIdrRate: rate,
      usdtIdrRateSource: USDT_RATE_SOURCE,
      usdtIdrRateUpdatedAt: updatedAt,
      usdtIdrRateUpdatedBy: input.actor,
    },
    update: {
      usdtIdrRate: rate,
      usdtIdrRateSource: USDT_RATE_SOURCE,
      usdtIdrRateUpdatedAt: updatedAt,
      usdtIdrRateUpdatedBy: input.actor,
    },
  });
}
