import { describe, expect, it, vi } from "vitest";
import {
  isRetryableTransactionError,
  retryableTransactionErrorCode,
  runIdempotentTransactionWithRetry,
} from "@/server/db/transaction-retry";
import { existingBridgeEventDisposition } from "@/server/payment/bridge-event-state";

describe("bounded transaction contention retry", () => {
  it("recognizes serialization, deadlock, lock, and transaction-start contention", () => {
    expect(retryableTransactionErrorCode({ code: "P2034" })).toBe("P2034");
    expect(retryableTransactionErrorCode({ code: "40001" })).toBe("40001");
    expect(retryableTransactionErrorCode({ code: "40P01" })).toBe("40P01");
    expect(retryableTransactionErrorCode({ code: "55P03" })).toBe("55P03");
    expect(
      retryableTransactionErrorCode({
        code: "P2039",
        meta: {
          driverAdapterError: {
            cause: { kind: "postgres", code: "40P01" },
          },
        },
      }),
    ).toBe("40P01");
    expect(
      retryableTransactionErrorCode({
        code: "P2028",
        message: "Unable to start a transaction in the given time.",
      }),
    ).toBe("P2028");
    expect(
      retryableTransactionErrorCode({
        code: "P2028",
        message: "Transaction already closed: Could not perform operation.",
      }),
    ).toBeNull();
    expect(isRetryableTransactionError(new Error("business validation failed"))).toBe(
      false,
    );
  });

  it("retries a failed transaction with bounded backoff and returns once", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: "P2034" })
      .mockResolvedValue("confirmed");
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();

    await expect(
      runIdempotentTransactionWithRetry(operation, {
        label: "payment-confirmation",
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 20,
        random: () => 0,
        sleep,
        onRetry,
      }),
    ).resolves.toBe("confirmed");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
    expect(onRetry).toHaveBeenCalledWith({
      label: "payment-confirmation",
      attempt: 1,
      nextAttempt: 2,
      delayMs: 10,
      errorCode: "P2034",
    });
  });

  it("does not retry a non-contention error or exceed its attempt cap", async () => {
    const businessError = new Error("Invoice has expired");
    const noRetry = vi.fn<() => Promise<never>>().mockRejectedValue(businessError);
    await expect(
      runIdempotentTransactionWithRetry(noRetry, {
        label: "payment-confirmation",
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toBe(businessError);
    expect(noRetry).toHaveBeenCalledOnce();

    const contention = vi.fn<() => Promise<never>>().mockRejectedValue({ code: "P2034" });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      runIdempotentTransactionWithRetry(contention, {
        label: "checkout",
        maxAttempts: 2,
        baseDelayMs: 10,
        random: () => 0,
        sleep,
      }),
    ).rejects.toMatchObject({ code: "P2034" });
    expect(contention).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });
});

describe("bridge payment event replay state", () => {
  it("resumes an identical event left RECEIVED after transient contention", () => {
    expect(
      existingBridgeEventDisposition({
        status: "RECEIVED",
        payloadHash: "same",
        expectedPayloadHash: "same",
      }),
    ).toBe("retry");
  });

  it("does not replay terminal or payload-mismatched events", () => {
    expect(
      existingBridgeEventDisposition({
        status: "CONFIRMED",
        payloadHash: "same",
        expectedPayloadHash: "same",
      }),
    ).toBe("duplicate");
    expect(
      existingBridgeEventDisposition({
        status: "RECEIVED",
        payloadHash: "old-payload",
        expectedPayloadHash: "different-payload",
      }),
    ).toBe("duplicate");
  });
});
