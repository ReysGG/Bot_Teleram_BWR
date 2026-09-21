export type UsdtBep20GuardAttempt = { status: string; verificationExpiresAt: Date };
export function usdtBep20AttemptBlocksOrderClosure(attempt: UsdtBep20GuardAttempt | null | undefined, now = new Date()) {
  if (!attempt) return false;
  if (attempt.status === "VERIFIED") return true;
  return (attempt.status === "VERIFYING" || attempt.status === "PENDING_CONFIRMATIONS") && attempt.verificationExpiresAt > now;
}
