import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { optionalEnv } from "@/server/env";

const STORE_RUNTIME_ID = "global";
export const BSC_MAINNET_CHAIN_ID = 56;
export const DEFAULT_BSC_RPC_URL = "https://bsc-dataseed.bnbchain.org";
export const DEFAULT_USDT_BEP20_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";
export const DEFAULT_USDT_BEP20_DECIMALS = 18;
export const DEFAULT_USDT_BEP20_CONFIRMATIONS = 12;
export type UsdtBep20SettingClient = Pick<Prisma.TransactionClient, "storeRuntimeSetting">;
export function normalizeEvmAddress(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) throw new Error("Alamat BEP20 tidak valid.");
  return normalized;
}
export function getBscRpcConfiguration() {
  const configured = optionalEnv("BSC_RPC_URL");
  return { url: configured ?? DEFAULT_BSC_RPC_URL, source: configured ? ("ENV" as const) : ("PUBLIC_FALLBACK" as const) };
}
export async function getUsdtBep20Setting(client: UsdtBep20SettingClient = prisma) {
  const setting = await client.storeRuntimeSetting.findUnique({ where: { id: STORE_RUNTIME_ID }, select: {
    usdtBep20Enabled: true, usdtBep20RecipientAddress: true, usdtBep20TokenContract: true,
    usdtBep20TokenDecimals: true, usdtBep20RequiredConfirmations: true, usdtBep20UpdatedAt: true, usdtBep20UpdatedBy: true,
  }});
  return { enabled: setting?.usdtBep20Enabled ?? false, recipientAddress: setting?.usdtBep20RecipientAddress ?? null,
    tokenContract: setting?.usdtBep20TokenContract ?? DEFAULT_USDT_BEP20_CONTRACT,
    tokenDecimals: setting?.usdtBep20TokenDecimals ?? DEFAULT_USDT_BEP20_DECIMALS,
    requiredConfirmations: setting?.usdtBep20RequiredConfirmations ?? DEFAULT_USDT_BEP20_CONFIRMATIONS,
    chainId: BSC_MAINNET_CHAIN_ID, rpc: getBscRpcConfiguration(), updatedAt: setting?.usdtBep20UpdatedAt ?? null,
    updatedBy: setting?.usdtBep20UpdatedBy ?? null };
}
export async function setUsdtBep20Setting(input: { enabled: boolean; recipientAddress?: string | null; tokenContract?: string | null; tokenDecimals?: number; requiredConfirmations?: number; allowCustomTokenContract?: boolean; actor: string }, client: UsdtBep20SettingClient = prisma) {
  const recipientAddress = input.recipientAddress?.trim() ? normalizeEvmAddress(input.recipientAddress) : null;
  const tokenContract = normalizeEvmAddress(input.tokenContract ?? DEFAULT_USDT_BEP20_CONTRACT);
  if (tokenContract !== DEFAULT_USDT_BEP20_CONTRACT && !input.allowCustomTokenContract) throw new Error("Kontrak token non-default memerlukan konfirmasi risiko eksplisit.");
  const tokenDecimals = input.tokenDecimals ?? DEFAULT_USDT_BEP20_DECIMALS;
  const requiredConfirmations = input.requiredConfirmations ?? DEFAULT_USDT_BEP20_CONFIRMATIONS;
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 6 || tokenDecimals > 30) throw new Error("Desimal token tidak valid.");
  if (!Number.isInteger(requiredConfirmations) || requiredConfirmations < 1 || requiredConfirmations > 100) throw new Error("Konfirmasi blok tidak valid.");
  if (input.enabled && !recipientAddress) throw new Error("Alamat penerima BEP20 wajib diisi sebelum pembayaran diaktifkan.");
  const updatedAt = new Date();
  return client.storeRuntimeSetting.upsert({ where: { id: STORE_RUNTIME_ID }, create: { id: STORE_RUNTIME_ID, usdtBep20Enabled: input.enabled, usdtBep20RecipientAddress: recipientAddress, usdtBep20TokenContract: tokenContract, usdtBep20TokenDecimals: tokenDecimals, usdtBep20RequiredConfirmations: requiredConfirmations, usdtBep20UpdatedAt: updatedAt, usdtBep20UpdatedBy: input.actor }, update: { usdtBep20Enabled: input.enabled, usdtBep20RecipientAddress: recipientAddress, usdtBep20TokenContract: tokenContract, usdtBep20TokenDecimals: tokenDecimals, usdtBep20RequiredConfirmations: requiredConfirmations, usdtBep20UpdatedAt: updatedAt, usdtBep20UpdatedBy: input.actor } });
}
