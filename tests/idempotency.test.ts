import { describe, expect, it } from "vitest";
import { consumeRateLimit, rateLimitSource } from "@/server/security/rate-limit";
import {
  serializeWalletAdjustmentNotification,
  walletAdjustmentDedupeKey,
  walletAdjustmentNotificationText,
} from "@/server/wallet/notification";
import {
  allOrderUnitsDelivered,
  digitalDeliveryFailureAllowsAutomaticRefund,
  deliveredStockState,
  deliveryReceiptAllowsSend,
  failedReceiptCanMoveToPaidOrder,
  notificationClaimWhere,
  notificationWorkerSlots,
  orderAllowsDigitalDelivery,
  recoverableDeliveryReceiptCollisionError,
  unhandledNotificationState,
} from "@/server/telegram/delivery-worker";
import { deliveryRetryBlockReason } from "@/server/telegram/delivery-retry";
import { TelegramApiError } from "@/server/telegram/api";

describe("delivery retry policy", () => {
  it("never refunds a paid order because Telegram rejected caption entities", () => {
    expect(digitalDeliveryFailureAllowsAutomaticRefund(
      new TelegramApiError(
        "Telegram rejected sendDocument: 400 Bad Request: ENTITY_TEXT_INVALID",
        true,
        undefined,
        false,
        400,
      ),
    )).toBe(false);
    expect(digitalDeliveryFailureAllowsAutomaticRefund(
      new TelegramApiError(
        "Telegram rejected sendDocument: 400 Bad Request: chat not found",
        true,
        undefined,
        false,
        400,
      ),
    )).toBe(true);
    expect(digitalDeliveryFailureAllowsAutomaticRefund(
      new TelegramApiError(
        "Telegram rejected sendDocument: 403 Forbidden: bot was blocked by the user",
        true,
        undefined,
        false,
        403,
      ),
    )).toBe(true);
    expect(digitalDeliveryFailureAllowsAutomaticRefund(
      new TelegramApiError(
        "Telegram rejected sendDocument: 400 Bad Request: file is too big",
        true,
        undefined,
        false,
        400,
      ),
    )).toBe(false);
    expect(digitalDeliveryFailureAllowsAutomaticRefund(
      new TelegramApiError(
        "Telegram document outcome is unknown",
        false,
      ),
    )).toBe(false);
    expect(digitalDeliveryFailureAllowsAutomaticRefund(
      new TelegramApiError(
        "Telegram rejected sendDocument: 500 Internal Server Error",
        true,
        undefined,
        true,
        500,
      ),
    )).toBe(false);
    expect(digitalDeliveryFailureAllowsAutomaticRefund(
      new Error("decrypt failed"),
    )).toBe(false);
  });

  it("does not let an uncaught handler error strand a claimed notification", () => {
    expect(unhandledNotificationState({ attempts: 1, ambiguous: false })).toBe("PENDING");
    expect(unhandledNotificationState({ attempts: 5, ambiguous: false })).toBe("FAILED");
    expect(
      unhandledNotificationState({ attempts: 1, ambiguous: false, retryable: false }),
    ).toBe("FAILED");
    expect(unhandledNotificationState({ attempts: 5, ambiguous: true })).toBe("MANUAL_REVIEW");
  });

  it("caps concurrent notification slots while allowing small batches to drain in parallel", () => {
    expect(notificationWorkerSlots(0, 3)).toBe(0);
    expect(notificationWorkerSlots(2, 3)).toBe(2);
    expect(notificationWorkerSlots(100, 10)).toBe(6);
    expect(notificationWorkerSlots(100, Number.NaN)).toBe(1);
  });

  it("allows new and definitely failed deliveries", () => {
    expect(deliveryReceiptAllowsSend("NEW")).toBe(true);
    expect(deliveryReceiptAllowsSend("FAILED")).toBe(true);
  });

  it("blocks automatic resend after an ambiguous or completed attempt", () => {
    expect(deliveryReceiptAllowsSend("SENDING")).toBe(false);
    expect(deliveryReceiptAllowsSend("UNKNOWN")).toBe(false);
    expect(deliveryReceiptAllowsSend("SENT")).toBe(false);
  });

  it("only sends digital stock for paid orders in the fulfilling state", () => {
    expect(
      orderAllowsDigitalDelivery({ status: "FULFILLING", paymentStatus: "PAID" }),
    ).toBe(true);
    for (const status of [
      "PENDING_PAYMENT",
      "PAID_WAITING_STOCK",
      "PAID",
      "COMPLETED",
      "EXPIRED",
      "CANCELLED",
      "REFUNDED",
    ]) {
      expect(orderAllowsDigitalDelivery({ status, paymentStatus: "PAID" })).toBe(false);
    }
    expect(
      orderAllowsDigitalDelivery({ status: "FULFILLING", paymentStatus: "EXPIRED" }),
    ).toBe(false);
  });

  it("moves a definitively failed receipt only after refund and safe re-reservation", () => {
    const safe = {
      receiptStatus: "FAILED",
      telegramMessageId: null,
      sentAt: null,
      previousOrderStatus: "REFUNDED",
      previousOrderRefundedAt: new Date(),
      stockStatus: "RESERVED",
      reservedOrderId: "new-order",
      targetOrderId: "new-order",
      targetHasStockItem: true,
    };
    expect(failedReceiptCanMoveToPaidOrder(safe)).toBe(true);
    expect(
      failedReceiptCanMoveToPaidOrder({ ...safe, receiptStatus: "UNKNOWN" }),
    ).toBe(false);
    expect(
      failedReceiptCanMoveToPaidOrder({ ...safe, telegramMessageId: "99" }),
    ).toBe(false);
    expect(
      failedReceiptCanMoveToPaidOrder({
        ...safe,
        previousOrderStatus: "FULFILLING",
        previousOrderRefundedAt: null,
      }),
    ).toBe(false);
    expect(
      failedReceiptCanMoveToPaidOrder({ ...safe, reservedOrderId: "other-order" }),
    ).toBe(false);
  });

  it("recognizes only the historical stock receipt collision failure", () => {
    expect(
      recoverableDeliveryReceiptCollisionError(
        'Invalid `prisma.sentDelivery.create()` invocation: Unique constraint failed on the fields: (`"stockItemId"`)',
      ),
    ).toBe(true);
    expect(
      recoverableDeliveryReceiptCollisionError(
        'Unique constraint failed on the fields: (`"dedupeKey"`)',
      ),
    ).toBe(false);
  });

  it("completes a multi-file order only after every unit is delivered", () => {
    expect(allOrderUnitsDelivered(["DELIVERED", "RESERVED"])).toBe(false);
    expect(allOrderUnitsDelivered(["DELIVERED", null])).toBe(false);
    expect(allOrderUnitsDelivered(["DELIVERED", "DELIVERED"])).toBe(true);
  });

  it("keeps delivered stock in Terjual until an admin archives it", () => {
    const deliveredAt = new Date("2026-07-30T12:00:00.000Z");
    expect(deliveredStockState("order-1", deliveredAt)).toEqual({
      status: "DELIVERED",
      deliveredOrderId: "order-1",
      deliveredAt,
      archivedAt: null,
    });
  });

  it("does not claim two notifications for the same active Telegram chat", () => {
    const now = new Date("2026-08-11T10:00:00.000Z");
    expect(notificationClaimWhere(now, ["chat-1", "chat-2"])).toMatchObject({
      AND: expect.arrayContaining([
        { chatId: { notIn: ["chat-1", "chat-2"] } },
      ]),
    });
  });

  it("allows retry only for a definite failure that has not been refunded", () => {
    const safe = {
      receiptStatus: "FAILED",
      notificationStatus: "FAILED",
      orderStatus: "FULFILLING",
      refundedAt: null,
      hasRefundTransaction: false,
      hasAmbiguousDelivery: false,
      stockStillAssigned: true,
      stockStatus: "RESERVED",
      reservedOrderMatches: true,
    };
    expect(deliveryRetryBlockReason(safe)).toBeNull();
    expect(deliveryRetryBlockReason({ ...safe, notificationStatus: "PENDING" })).toBeNull();
    expect(deliveryRetryBlockReason({ ...safe, receiptStatus: "UNKNOWN" })).toContain("terbukti gagal");
    expect(deliveryRetryBlockReason({ ...safe, hasRefundTransaction: true })).toContain("direfund");
    expect(deliveryRetryBlockReason({ ...safe, hasAmbiguousDelivery: true })).toContain("ambigu");
  });
});

describe("rate limiting", () => {
  it("uses one bounded forwarded source identity", () => {
    const headers = new Headers({
      "x-forwarded-for": " 203.0.113.10, 10.0.0.1 ",
    });
    expect(rateLimitSource(headers)).toBe("203.0.113.10");
    expect(rateLimitSource(new Headers(), "bridge")).toBe("bridge");
  });

  it("resets after the configured window", () => {
    const key = `test:${Math.random()}`;
    expect(consumeRateLimit(key, 2, 1_000, 10_000)).toBe(true);
    expect(consumeRateLimit(key, 2, 1_000, 10_100)).toBe(true);
    expect(consumeRateLimit(key, 2, 1_000, 10_200)).toBe(false);
    expect(consumeRateLimit(key, 2, 1_000, 11_001)).toBe(true);
  });
});

describe("wallet adjustment notifications", () => {
  it("renders admin credit and debit without exposing the admin identity", () => {
    expect(walletAdjustmentDedupeKey("tx-1")).toBe("wallet-adjustment:tx-1");
    expect(
      walletAdjustmentNotificationText(
        serializeWalletAdjustmentNotification({
          amount: 25_000,
          balanceBefore: 10_000,
          balanceAfter: 35_000,
          note: "Bonus layanan",
        }),
      ),
    ).toContain("Saldo ditambahkan");
    expect(
      walletAdjustmentNotificationText(
        serializeWalletAdjustmentNotification({
          amount: -5_000,
          balanceBefore: 35_000,
          balanceAfter: 30_000,
          note: "Koreksi transaksi",
        }),
      ),
    ).toContain("Saldo dikurangi");
  });
});
