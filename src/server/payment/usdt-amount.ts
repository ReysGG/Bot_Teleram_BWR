export const USDT_MICRO_FACTOR = 1_000_000;
export const DEFAULT_USDT_IDR_RATE = 18_500;
export const MIN_USDT_IDR_RATE = 5_000;
export const MAX_USDT_IDR_RATE = 100_000;

function assertSafeNonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} harus berupa bilangan bulat non-negatif yang aman.`);
  }
}

export function normalizeUsdtIdrRate(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_USDT_IDR_RATE ||
    value > MAX_USDT_IDR_RATE
  ) {
    throw new RangeError(
      `Kurs USDT harus berupa bilangan bulat antara ${MIN_USDT_IDR_RATE} dan ${MAX_USDT_IDR_RATE}.`,
    );
  }
  return value;
}

export function idrToUsdtMicros(idrAmount: number, idrPerUsdt: number): number {
  assertSafeNonNegativeInteger(idrAmount, "Nominal IDR");
  const rate = normalizeUsdtIdrRate(idrPerUsdt);
  const numerator = BigInt(idrAmount) * BigInt(USDT_MICRO_FACTOR);
  const divisor = BigInt(rate);
  const micros = (numerator + divisor - 1n) / divisor;
  if (micros > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Hasil konversi USDT melampaui batas aman.");
  }
  return Number(micros);
}

export function formatUsdtMicros(micros: number): string {
  assertSafeNonNegativeInteger(micros, "Nominal micro-USDT");
  const whole = Math.floor(micros / USDT_MICRO_FACTOR);
  const fraction = String(micros % USDT_MICRO_FACTOR)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""} USDT`;
}

export function formatUsdtMicrosForInput(micros: number): string {
  assertSafeNonNegativeInteger(micros, "Nominal micro-USDT");
  const whole = Math.floor(micros / USDT_MICRO_FACTOR);
  const fraction = String(micros % USDT_MICRO_FACTOR)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

export function formatIdrAsUsdt(idrAmount: number, idrPerUsdt: number): string {
  return formatUsdtMicros(idrToUsdtMicros(idrAmount, idrPerUsdt));
}
