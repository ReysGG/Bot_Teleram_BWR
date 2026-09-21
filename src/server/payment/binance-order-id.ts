import { optionalEnv } from "@/server/env";

export class BinanceOrderIdValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BinanceOrderIdValidationError";
  }
}

export function normalizeBinanceOrderIdValue(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(normalized)) {
    throw new BinanceOrderIdValidationError(
      "Order ID Binance harus berisi 6-128 huruf atau angka.",
    );
  }
  return normalized;
}

export function canonicalBinanceOrderIdValue(value: string): string {
  const submitted = normalizeBinanceOrderIdValue(value);
  const prefix = optionalEnv("BINANCE_ORDER_ID_PREFIX")?.trim() ?? "";
  if (!prefix) return submitted;
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(prefix)) {
    throw new Error("BINANCE_ORDER_ID_PREFIX tidak valid.");
  }
  if (submitted.startsWith(prefix)) return submitted;
  return /^\d+$/.test(submitted) ? `${prefix}${submitted}` : submitted;
}

export function binanceOrderIdValueAliases(value: string): string[] {
  const submitted = normalizeBinanceOrderIdValue(value);
  const configuredPrefix = optionalEnv("BINANCE_ORDER_ID_PREFIX")?.trim();
  const aliases = new Set([submitted, canonicalBinanceOrderIdValue(submitted)]);
  const prefixes = [
    ...new Set(["M_P_", ...(configuredPrefix ? [configuredPrefix] : [])]),
  ];
  const numericId = /^\d+$/.test(submitted)
    ? submitted
    : prefixes
        .filter((prefix) => submitted.startsWith(prefix))
        .map((prefix) => submitted.slice(prefix.length))
        .find((suffix) => /^\d{6,128}$/.test(suffix));
  if (numericId) {
    aliases.add(numericId);
    for (const prefix of prefixes) aliases.add(`${prefix}${numericId}`);
  }
  return [...aliases];
}
