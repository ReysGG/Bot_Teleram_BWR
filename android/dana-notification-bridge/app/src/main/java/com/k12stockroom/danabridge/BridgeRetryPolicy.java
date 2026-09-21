package com.k12stockroom.danabridge;

final class BridgeRetryPolicy {
    static final long BASE_DELAY_MS = 2_000L;
    static final long MAX_DELAY_MS = 5 * 60_000L;

    private BridgeRetryPolicy() {}

    static long nextDelayMs(int attemptCount, long serverRetryAfterMs, double jitterUnit) {
        int exponent = Math.max(0, Math.min(20, attemptCount - 1));
        long exponential;
        if (exponent >= 18) exponential = MAX_DELAY_MS;
        else exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * (1L << exponent));

        double normalizedJitter = Math.max(0.0, Math.min(1.0, jitterUnit));
        long jittered = Math.max(
            BASE_DELAY_MS,
            Math.round(exponential * (0.8 + normalizedJitter * 0.4))
        );
        long requested = serverRetryAfterMs > 0 ? serverRetryAfterMs : 0;
        return Math.min(MAX_DELAY_MS, Math.max(jittered, requested));
    }
}
