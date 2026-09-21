import { describe, expect, it, vi } from "vitest";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import {
  processAndroidBridgeNotification,
  type AndroidBridgePayload,
  type AndroidBridgeProcessorDependencies,
} from "@/server/payment/android-bridge";
import {
  deliveryReceiptAllowsSend,
  notificationWorkerSlots,
} from "@/server/telegram/delivery-worker";
import { digitalDeliveryDedupeKey } from "@/server/telegram/delivery-key";

const bridgePayload: AndroidBridgePayload = {
  eventId: "load-event-1234567890abcdef",
  deviceId: "load-device-1234567890",
  packageName: "id.dana",
  title: "Pembayaran diterima",
  body: "Kamu menerima Rp25.347",
  postedAt: "2026-08-11T04:00:00.000Z",
};

describe("non-destructive concurrency load harness", () => {
  it("deduplicates 250 simultaneous copies of one payment webhook", async () => {
    let eventClaimed = false;
    let paymentConfirmed = false;
    const dependencies: AndroidBridgeProcessorDependencies = {
      beginEvent: vi.fn(async () => {
        await Promise.resolve();
        if (eventClaimed) return "duplicate" as const;
        eventClaimed = true;
        return "new" as const;
      }),
      recordAmount: vi.fn().mockResolvedValue(undefined),
      rejectEvent: vi.fn().mockResolvedValue(undefined),
      findMatchingTargets: vi
        .fn()
        .mockResolvedValue([{ kind: "order", id: "order-load" }]),
      confirmPayment: vi.fn(async () => {
        if (paymentConfirmed) throw new Error("payment confirmed twice");
        paymentConfirmed = true;
      }),
    };
    const rawPayload = JSON.stringify(bridgePayload);

    const results = await Promise.all(
      Array.from({ length: 250 }, () =>
        processAndroidBridgeNotification(
          bridgePayload,
          rawPayload,
          dependencies,
        ),
      ),
    );

    expect(results.filter((result) => result.status === "confirmed")).toHaveLength(1);
    expect(results.filter((result) => result.status === "duplicate")).toHaveLength(249);
    expect(dependencies.confirmPayment).toHaveBeenCalledOnce();
  });

  it("uses one shared store lock plus an independent lock for every product", async () => {
    const productLockKeys: string[] = [];
    const tx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      $executeRaw: vi.fn(
        async (_strings: TemplateStringsArray, lockKey: string) => {
          productLockKeys.push(lockKey);
          return 0;
        },
      ),
    };
    const productIds = Array.from({ length: 200 }, (_, index) => `product-${index}`);

    await Promise.all(
      productIds.map((productId) =>
        lockInventoryAllocation(tx as never, productId),
      ),
    );

    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(200);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock_shared"),
    );
    expect(productLockKeys).toHaveLength(200);
    expect(new Set(productLockKeys).size).toBe(200);
    expect(productLockKeys).toContain("telegram_product_inventory_product-0");
    expect(productLockKeys).toContain("telegram_product_inventory_product-199");
  });

  it("caps a 500-job notification burst and keeps delivery keys stable", () => {
    expect(notificationWorkerSlots(500, 500)).toBe(6);
    expect(notificationWorkerSlots(500, 3)).toBe(3);

    const repeated = Array.from({ length: 500 }, () =>
      digitalDeliveryDedupeKey("order-1", "stock-1"),
    );
    expect(new Set(repeated)).toEqual(
      new Set([digitalDeliveryDedupeKey("order-1", "stock-1")]),
    );
    const distinct = Array.from({ length: 500 }, (_, index) =>
      digitalDeliveryDedupeKey("order-1", `stock-${index}`),
    );
    expect(new Set(distinct).size).toBe(500);
    expect(deliveryReceiptAllowsSend("SENT")).toBe(false);
    expect(deliveryReceiptAllowsSend("SENDING")).toBe(false);
    expect(deliveryReceiptAllowsSend("UNKNOWN")).toBe(false);
  });
});
