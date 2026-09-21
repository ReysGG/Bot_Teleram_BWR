import { afterEach, describe, expect, it } from "vitest";
import {
  digitalPurchaseSuccessMessage,
  maskBuyer,
  safePublicLabel,
  smsPurchaseSuccessMessage,
  successChannelId,
  successChannelSmsOrderId,
} from "@/server/telegram/success-channel";

describe("success channel notifications", () => {
  afterEach(() => {
    delete process.env.TELEGRAM_SUCCESS_CHANNEL_ID;
  });

  it("masks buyer identity and never includes credentials", () => {
    expect(maskBuyer("davidseller")).toBe("da***");
    const message = digitalPurchaseSuccessMessage({
      buyer: "davidseller",
      productNames: ["ChatGPT K12 Json"],
      total: 10_000,
      quantity: 1,
    });
    expect(message).toContain("Pembeli: da***");
    expect(message).toContain("10.000");
    expect(message).not.toContain("davidseller");
  });

  it("creates a sanitized SMS success message", () => {
    const message = smsPurchaseSuccessMessage({
      buyer: "buyername",
      serviceName: "OpenAI",
      countryName: "Indonesia",
      total: 5_700,
    });
    expect(message).toContain("OpenAI");
    expect(message).toContain("Indonesia");
    expect(message).not.toContain("OTP:");
    expect(message).not.toContain("buyername");
  });

  it("reads the destination channel only from server environment", () => {
    process.env.TELEGRAM_SUCCESS_CHANNEL_ID = "-1004339051068";
    expect(successChannelId()).toBe("-1004339051068");
  });

  it("removes line breaks and control characters from public labels", () => {
    expect(safePublicLabel("OpenAI\naccess_token=secret\u0000", "OTP"))
      .toBe("OTP");
    expect(safePublicLabel("buyer@example.test", "User")).toBe("User");
    const message = digitalPurchaseSuccessMessage({
      buyer: "buyer\nname",
      productNames: ["ChatGPT\ninternal detail"],
      total: 10_000,
      quantity: 1,
    });
    expect(message).not.toContain("buyer\nname");
    expect(message).not.toContain("ChatGPT\ninternal detail");
  });

  it("accepts only the expected SMS success-channel dedupe key", () => {
    expect(successChannelSmsOrderId("success-channel:sms:sms_123"))
      .toBe("sms_123");
    expect(successChannelSmsOrderId("success-channel:order:order_123")).toBeNull();
    expect(successChannelSmsOrderId("success-channel:sms:../../secret")).toBeNull();
  });
});
