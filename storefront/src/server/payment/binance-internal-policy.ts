export type BinanceInternalGuardAttempt = {
  status: string;
  verificationExpiresAt: Date;
};

export function binanceInternalAttemptBlocksOrderClosure(
  attempt: BinanceInternalGuardAttempt | null | undefined,
  now = new Date(),
) {
  if (!attempt) return false;
  if (attempt.status === "VERIFIED") return true;
  return attempt.status === "VERIFYING" && attempt.verificationExpiresAt > now;
}
