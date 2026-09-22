export const SHOPEE_MAX_POLL_AGE_MS = 120_000;
export const SHOPEE_EVIDENCE_CHECK_INTERVAL_MS = 5 * 60_000;

export function shopeeSessionHealthReason(session: {
  status: string;
  lastSuccessfulPollAt: Date | null;
  lastErrorCode: string | null;
} | null, now = new Date()): string | null {
  if (!session || session.status !== "ACTIVE") return "SESSION_UNAVAILABLE";
  if (["AUTH_REQUIRED", "ACCOUNT_MISMATCH", "UPSTREAM_CHALLENGE", "UPSTREAM_CONTRACT_UNKNOWN", "UPSTREAM_RESPONSE_TOO_LARGE", "EVIDENCE_UNAVAILABLE"].includes(session.lastErrorCode ?? "")) return session.lastErrorCode;
  if (!session.lastSuccessfulPollAt || now.getTime() - session.lastSuccessfulPollAt.getTime() > SHOPEE_MAX_POLL_AGE_MS) return "POLL_STALE";
  return null;
}
