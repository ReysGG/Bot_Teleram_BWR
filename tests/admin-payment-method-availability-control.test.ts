import { describe, expect, it } from "vitest";
import { normalizeMethodValues } from "@/components/admin/payment-method-availability-control";

const values = {
  qrisDanaEnabled: false,
  walletCheckoutEnabled: true,
  mixedWalletQrisEnabled: false,
  walletTopupEnabled: true,
  jagoTransferEnabled: true,
  binanceInternalEnabled: false,
  usdtBep20Enabled: false,
};

describe("admin payment method dependency normalization", () => {
  it("keeps wallet top up enabled for a Jago-only configuration", () => {
    expect(normalizeMethodValues(values).walletTopupEnabled).toBe(true);
  });

  it("disables wallet top up when wallet checkout or every Rupiah provider is off", () => {
    expect(normalizeMethodValues({ ...values, walletCheckoutEnabled: false }).walletTopupEnabled)
      .toBe(false);
    expect(normalizeMethodValues({
      ...values,
      jagoTransferEnabled: false,
    }).walletTopupEnabled).toBe(false);
  });
});
