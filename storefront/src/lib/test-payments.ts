import "server-only";

export function localTestPaymentsAllowed() {
  if (process.env.NODE_ENV === "production") return false;
  try {
    const target = new URL(process.env.TELEGRAM_STORE_API_BASE_URL ?? "");
    return ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  } catch { return false; }
}
