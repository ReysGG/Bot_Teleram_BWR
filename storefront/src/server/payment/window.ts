export const PAYMENT_EVENT_CLOCK_SKEW_MS = 5 * 60_000;

export function isPaymentEventWithinWindow(input: {
  postedAt: Date;
  createdAt: Date;
  expiresAt: Date;
  skewMs?: number;
}): boolean {
  const skewMs = Math.max(
    input.skewMs ?? PAYMENT_EVENT_CLOCK_SKEW_MS,
    0,
  );
  return (
    input.postedAt.getTime() >= input.createdAt.getTime() - skewMs &&
    input.postedAt.getTime() <= input.expiresAt.getTime() + skewMs
  );
}

export function paymentAmountReservationCutoff(
  now = new Date(),
  skewMs = PAYMENT_EVENT_CLOCK_SKEW_MS,
): Date {
  return new Date(now.getTime() - Math.max(skewMs, 0));
}
