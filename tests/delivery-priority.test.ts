import { describe, expect, it } from "vitest";
import {
  DIGITAL_DELIVERY_PRIORITY,
  PAYMENT_SUCCESS_PRIORITY,
  PRODUCT_RESTOCK_PRIORITY,
  PRODUCT_SOLD_OUT_PRIORITY,
} from "@/server/telegram/delivery-key";
import {
  ORDER_DELIVERY_FOLLOWUP_PRIORITY,
  PRODUCT_ATTACHMENT_PRIORITY,
} from "@/server/telegram/order-delivery-followup";
import { PRODUCT_POST_DELIVERY_PRIORITY } from "@/server/products/post-delivery";
import { TelegramApiError } from "@/server/telegram/api";
import {
  digitalDeliveryOutcomeAmbiguous,
  recoverablePostDeliverySnapshot,
} from "@/server/telegram/delivery-worker";

describe("Telegram fulfillment priority", () => {
  it("always sends payment confirmation and buyer files before catalog broadcasts", () => {
    expect(PAYMENT_SUCCESS_PRIORITY).toBeLessThan(DIGITAL_DELIVERY_PRIORITY);
    expect(DIGITAL_DELIVERY_PRIORITY).toBeLessThan(PRODUCT_RESTOCK_PRIORITY);
    expect(DIGITAL_DELIVERY_PRIORITY).toBeLessThan(PRODUCT_SOLD_OUT_PRIORITY);
  });

  it("drains private post-delivery stages before public catalog broadcasts", () => {
    expect(DIGITAL_DELIVERY_PRIORITY).toBeLessThan(ORDER_DELIVERY_FOLLOWUP_PRIORITY);
    expect(ORDER_DELIVERY_FOLLOWUP_PRIORITY).toBeLessThan(PRODUCT_ATTACHMENT_PRIORITY);
    expect(PRODUCT_ATTACHMENT_PRIORITY).toBeLessThan(PRODUCT_POST_DELIVERY_PRIORITY);
    expect(PRODUCT_POST_DELIVERY_PRIORITY).toBeLessThan(PRODUCT_RESTOCK_PRIORITY);
    expect(PRODUCT_POST_DELIVERY_PRIORITY).toBeLessThan(PRODUCT_SOLD_OUT_PRIORITY);
  });

  it("never retries a credential upload whose Telegram outcome may be ambiguous", () => {
    expect(
      digitalDeliveryOutcomeAmbiguous(
        new TelegramApiError("network outcome unknown", false),
      ),
    ).toBe(true);
    expect(
      digitalDeliveryOutcomeAmbiguous(
        new TelegramApiError("gateway error", true, undefined, true, 502),
      ),
    ).toBe(true);
    expect(
      digitalDeliveryOutcomeAmbiguous(
        new TelegramApiError("rate limited", true, 2, true, 429),
      ),
    ).toBe(false);
    expect(
      digitalDeliveryOutcomeAmbiguous(
        new TelegramApiError("bad request", true, undefined, false, 400),
      ),
    ).toBe(false);
  });

  it("requeues only guides that previously failed before any Telegram send", () => {
    const snapshot = JSON.stringify({
      version: 1,
      productName: "CDK",
      invoiceNumber: "TGS-1",
      messageText: "Panduan pembeli",
      messageEntities: [{ type: "bold", offset: 999, length: 2 }],
      redeemUrl: null,
    });
    expect(recoverablePostDeliverySnapshot({
      lastError: "Product post-delivery notification snapshot is invalid",
      messageText: snapshot,
    })).toBe(true);
    expect(recoverablePostDeliverySnapshot({
      lastError: "Telegram outcome is ambiguous",
      messageText: snapshot,
    })).toBe(false);
    expect(recoverablePostDeliverySnapshot({
      lastError: "Product post-delivery notification snapshot is invalid",
      messageText: "not-json",
    })).toBe(false);
  });
});
