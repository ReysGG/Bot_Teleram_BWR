package com.k12stockroom.danabridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class BridgeRetryPolicyTest {
    @Test
    public void growsExponentiallyWithBoundedJitter() {
        long first = BridgeRetryPolicy.nextDelayMs(1, 0, 0.5);
        long second = BridgeRetryPolicy.nextDelayMs(2, 0, 0.5);
        long third = BridgeRetryPolicy.nextDelayMs(3, 0, 0.5);

        assertEquals(2_000L, first);
        assertEquals(4_000L, second);
        assertEquals(8_000L, third);
    }

    @Test
    public void honorsRetryAfterWithoutExceedingMaximum() {
        assertEquals(
            45_000L,
            BridgeRetryPolicy.nextDelayMs(1, 45_000L, 0.0)
        );
        assertEquals(
            BridgeRetryPolicy.MAX_DELAY_MS,
            BridgeRetryPolicy.nextDelayMs(30, 60 * 60_000L, 1.0)
        );
    }

    @Test
    public void clampsInvalidJitterInput() {
        long low = BridgeRetryPolicy.nextDelayMs(4, 0, -5.0);
        long high = BridgeRetryPolicy.nextDelayMs(4, 0, 5.0);
        assertTrue(low >= BridgeRetryPolicy.BASE_DELAY_MS);
        assertTrue(high <= BridgeRetryPolicy.MAX_DELAY_MS);
    }
}
