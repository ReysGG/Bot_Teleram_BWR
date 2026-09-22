export const MAX_STOCK_ITEMS_PER_UPLOAD = 5_000;
export const MAX_PASTED_STOCK_BYTES = 1024 * 1024;

export function normalizePastedStockLines(value: string): string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function countUniquePastedStockLines(value: string): number {
  return new Set(normalizePastedStockLines(value)).size;
}
