import { describe, expect, it } from "vitest";
import {
  compareCheckoutAvailability,
  orderStatusLabel,
  paidOrderStatus,
  preorderSlotsRemaining,
  resolveCheckoutAvailability,
} from "@/server/preorder/policy";

it("prioritizes ready stock before preorder, locked, and sold-out products", () => {
  const statuses = [
    "OUT_OF_STOCK",
    "WAITING_CHECKOUT",
    "IN_STOCK",
    "PREORDER_FULL",
    "PREORDER",
  ] as const;
  expect([...statuses].sort(compareCheckoutAvailability)).toEqual([
    "IN_STOCK",
    "PREORDER",
    "WAITING_CHECKOUT",
    "PREORDER_FULL",
    "OUT_OF_STOCK",
  ]);
});
import { digitalDeliveryDedupeKey } from "@/server/telegram/delivery-key";
import { parsePreorderSettings } from "@/server/products/preorder";
import { stockMatchesOrderProduct } from "@/server/preorder/assign-stock";

describe("preorder checkout policy", () => {
  it("uses ready stock before opening a preorder slot", () => {
    expect(
      resolveCheckoutAvailability({
        stockAvailable: true,
        preorderEnabled: true,
        preorderLimit: 2,
        activePreorders: 2,
      }),
    ).toBe("IN_STOCK");
  });

  it("opens preorder only while the configured queue has capacity", () => {
    expect(
      resolveCheckoutAvailability({
        stockAvailable: false,
        preorderEnabled: true,
        preorderLimit: 2,
        activePreorders: 1,
      }),
    ).toBe("PREORDER");
    expect(
      resolveCheckoutAvailability({
        stockAvailable: false,
        preorderEnabled: true,
        preorderLimit: 2,
        activePreorders: 2,
      }),
    ).toBe("PREORDER_FULL");
    expect(preorderSlotsRemaining(2, 5)).toBe(0);
  });

  it("waits for active checkout reservations instead of opening preorder", () => {
    expect(
      resolveCheckoutAvailability({
        stockAvailable: false,
        reservedUnits: 2,
        preorderEnabled: true,
        preorderLimit: 5,
        activePreorders: 0,
      }),
    ).toBe("WAITING_CHECKOUT");
  });

  it("reserves preorder capacity by requested account units", () => {
    expect(
      resolveCheckoutAvailability({
        stockAvailable: false,
        preorderEnabled: true,
        preorderLimit: 10,
        activePreorders: 6,
        requestedUnits: 4,
      }),
    ).toBe("PREORDER");
    expect(
      resolveCheckoutAvailability({
        stockAvailable: false,
        preorderEnabled: true,
        preorderLimit: 10,
        activePreorders: 6,
        requestedUnits: 5,
      }),
    ).toBe("PREORDER_FULL");
  });

  it("keeps ordinary out-of-stock products unavailable", () => {
    expect(
      resolveCheckoutAvailability({
        stockAvailable: false,
        preorderEnabled: false,
        preorderLimit: null,
        activePreorders: 0,
      }),
    ).toBe("OUT_OF_STOCK");
  });

  it("requires an ETA and bounded queue when admin enables preorder", () => {
    expect(() =>
      parsePreorderSettings({ preorderEnabled: "on", preorderEtaText: "" }),
    ).toThrow();
    expect(
      parsePreorderSettings({
        preorderEnabled: "on",
        preorderEtaText: "1-3 hari",
        preorderLimit: "20",
      }),
    ).toEqual({
      preorderEnabled: true,
      preorderEtaText: "1-3 hari",
      preorderLimit: 20,
    });
  });
});

describe("paid preorder lifecycle", () => {
  it("only allows manual stock from the product purchased in the order", () => {
    expect(stockMatchesOrderProduct("product-a", "product-a")).toBe(true);
    expect(stockMatchesOrderProduct("product-b", "product-a")).toBe(false);
  });

  it("waits for stock only for an explicitly snapshotted preorder", () => {
    expect(paidOrderStatus({ isPreorder: true, hasReservedStock: false })).toBe(
      "PAID_WAITING_STOCK",
    );
    expect(paidOrderStatus({ isPreorder: true, hasReservedStock: true })).toBe(
      "FULFILLING",
    );
    expect(() =>
      paidOrderStatus({ isPreorder: false, hasReservedStock: false }),
    ).toThrow("no reserved stock");
  });

  it("exposes a clear buyer-facing waiting status", () => {
    expect(orderStatusLabel("PAID_WAITING_STOCK")).toBe("Lunas - menunggu stok");
  });

  it("uses the same delivery dedupe key after direct or FIFO allocation", () => {
    expect(digitalDeliveryDedupeKey("order-1", "stock-1")).toBe(
      "delivery:order-1:stock-1",
    );
  });
});
