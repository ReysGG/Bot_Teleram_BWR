export function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function safeFilename(value: string): string {
  const base = value.split(/[\\/]/).pop() ?? "digital-stock";
  return base.replace(/[^a-zA-Z0-9@+._-]/g, "_").slice(0, 180) || "digital-stock";
}

export function cleanError(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown error";
  return error.message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|password|client[_-]?secret|api[_-]?key)(\s*["']?\s*[:=]\s*["']?)([^\s,"';}]+)/gi,
      (_match, key: string, separator: string) => `${key}${separator}[REDACTED]`,
    )
    .replace(/\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g, "[REDACTED_KEY]")
    .slice(0, 500);
}
