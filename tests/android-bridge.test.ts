import { describe, expect, it, vi } from "vitest";
import {
  classifyAndroidBridgePayload,
  androidOrderPaymentMethods,
  androidWalletTopupPaymentMethod,
  isWithinPaymentWindow,
  parseRupiahAmounts,
  processAndroidBridgeNotification,
  type AndroidBridgePayload,
  type AndroidBridgeProcessorDependencies,
} from "@/server/payment/android-bridge";
import { isDanaBridgeOrderPaymentMethod } from "@/server/payment/dana-payment-method";
import { SHOPEE_PARTNER_ANDROID_PACKAGE } from "@/server/payment/android-payment-provider";

const payload: AndroidBridgePayload = {
  eventId: "event-1234567890abcdef",
  deviceId: "android-1234567890",
  packageName: "id.dana",
  title: "Pembayaran diterima",
  body: "Kamu menerima Rp25.347",
  postedAt: "2026-07-30T04:00:00.000Z",
};

const jagoPayload: AndroidBridgePayload = {
  ...payload,
  eventId: "jago-event-1234567890abcdef",
  packageName: "com.jago.digitalBanking",
  title: "Jago",
  body: "MUHAMMAD RIZKI YANTO telah mengirim Rp25.347 ke kamu. Buka aplikasi untuk melihat detail.",
};

const shopeePayload: AndroidBridgePayload = {
  ...payload,
  eventId: "shopee-event-1234567890abcdef",
  packageName: SHOPEE_PARTNER_ANDROID_PACKAGE,
  title: "Shopee Partner",
  body: "Pembayaran sebesar Rp25.347 telah diterima pada transaksi 240823ABCDEF.",
};

function dependencies(
  overrides: Partial<AndroidBridgeProcessorDependencies> = {},
): AndroidBridgeProcessorDependencies {
  return {
    beginEvent: vi.fn().mockResolvedValue("new"),
    recordAmount: vi.fn().mockResolvedValue(undefined),
    rejectEvent: vi.fn().mockResolvedValue(undefined),
    findMatchingTargets: vi.fn().mockResolvedValue([{ kind: "order", id: "order-1" }]),
    confirmPayment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Android DANA bridge classification", () => {
  it("only allows DANA-backed order methods into bridge matching", () => {
    expect(isDanaBridgeOrderPaymentMethod("DANA_RELAY")).toBe(true);
    expect(isDanaBridgeOrderPaymentMethod("WALLET_QRIS")).toBe(true);
    expect(isDanaBridgeOrderPaymentMethod("BINANCE_INTERNAL")).toBe(false);
    expect(isDanaBridgeOrderPaymentMethod("USDT_BEP20")).toBe(false);
  });

  it("keeps DANA and Jago invoice methods in separate provider buckets", () => {
    expect(androidOrderPaymentMethods("DANA")).toEqual([
      "DANA_RELAY",
      "WALLET_QRIS",
    ]);
    expect(androidOrderPaymentMethods("JAGO")).toEqual(["JAGO_TRANSFER"]);
    expect(androidOrderPaymentMethods("SHOPEE_PARTNER")).toEqual([
      "DANA_RELAY",
      "WALLET_QRIS",
    ]);
    expect(androidWalletTopupPaymentMethod("DANA")).toBe("DANA_RELAY");
    expect(androidWalletTopupPaymentMethod("JAGO")).toBe("JAGO_TRANSFER");
    expect(androidWalletTopupPaymentMethod("SHOPEE_PARTNER")).toBe("DANA_RELAY");
  });

  it("accepts only the exact Shopee Partner incoming-payment contract", () => {
    expect(classifyAndroidBridgePayload(shopeePayload)).toEqual({
      status: "accepted",
      provider: "SHOPEE_PARTNER",
      amount: 25_347,
    });
    expect(
      classifyAndroidBridgePayload({
        ...shopeePayload,
        body: "Pembayaran Rp25.347 berhasil diterima",
      }),
    ).toMatchObject({ status: "ignored_content" });
    expect(
      classifyAndroidBridgePayload({
        ...shopeePayload,
        body: "Pembayaran sebesar Rp25.347 telah dikirim pada transaksi 240823ABCDEF.",
      }),
    ).toMatchObject({ status: "ignored_content" });
  });

  it("recognizes the Bank Jago incoming-transfer notification contract", () => {
    expect(classifyAndroidBridgePayload(jagoPayload)).toEqual({
      status: "accepted",
      provider: "JAGO",
      amount: 25_347,
    });
    expect(
      classifyAndroidBridgePayload({
        ...jagoPayload,
        body: "Kamu menerima kiriman Rp35.098 dari SHADIQ HAIRWIZ. Buka aplikasi untuk melihat detail.",
      }),
    ).toEqual({
      status: "accepted",
      provider: "JAGO",
      amount: 35_098,
    });
    expect(
      classifyAndroidBridgePayload({
        ...jagoPayload,
        body: "Kamu menerima Rp10.565 dari GoPay. Buka aplikasi untuk melihat detail.",
      }),
    ).toEqual({
      status: "accepted",
      provider: "JAGO",
      amount: 10_565,
    });
    expect(
      classifyAndroidBridgePayload({
        ...jagoPayload,
        body: "Kamu telah mengirim Rp25.347 ke pengguna lain",
      }),
    ).toMatchObject({ status: "ignored_content" });
    expect(
      classifyAndroidBridgePayload({
        ...jagoPayload,
        body: "Kamu telah membayar Rp22.000 ke ESB RESTAURANT TECHNOLOGY. Buka aplikasi untuk melihat detail.",
      }),
    ).toMatchObject({ status: "ignored_content" });
  });

  it("extracts one exact Rupiah amount", () => {
    expect(parseRupiahAmounts("Masuk Rp25.347")).toEqual([25_347]);
    expect(parseRupiahAmounts("Rp25.347 dan Rp30.100")).toEqual([
      25_347,
      30_100,
    ]);
  });

  it("rejects untrusted packages, outgoing content, and multiple amounts", () => {
    expect(
      classifyAndroidBridgePayload({ ...payload, packageName: "com.example.fake" }),
    ).toMatchObject({ status: "rejected_package" });
    expect(
      classifyAndroidBridgePayload({ ...payload, body: "Cashback Rp25.347" }),
    ).toMatchObject({ status: "ignored_content" });
    expect(
      classifyAndroidBridgePayload({
        ...payload,
        body: "Kamu menerima Rp25.347, saldo Rp99.000",
      }),
    ).toMatchObject({ status: "ambiguous_amounts" });
  });

  it("enforces the payment creation and expiry window with clock skew", () => {
    const createdAt = new Date("2026-07-30T04:00:00.000Z");
    const expiresAt = new Date("2026-07-30T04:30:00.000Z");
    expect(
      isWithinPaymentWindow({
        postedAt: new Date("2026-07-30T03:56:00.000Z"),
        createdAt,
        expiresAt,
      }),
    ).toBe(true);
    expect(
      isWithinPaymentWindow({
        postedAt: new Date("2026-07-30T03:54:59.999Z"),
        createdAt,
        expiresAt,
      }),
    ).toBe(false);
    expect(
      isWithinPaymentWindow({
        postedAt: new Date("2026-07-30T04:35:00.001Z"),
        createdAt,
        expiresAt,
      }),
    ).toBe(false);
  });
});

describe("Android DANA bridge processing", () => {
  it("does not process an already terminal event twice", async () => {
    const deps = dependencies({ beginEvent: vi.fn().mockResolvedValue("duplicate") });
    await expect(
      processAndroidBridgeNotification(payload, JSON.stringify(payload), deps),
    ).resolves.toEqual({ status: "duplicate" });
    expect(deps.findMatchingTargets).not.toHaveBeenCalled();
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it("keeps Jago retries idempotent", async () => {
    const deps = dependencies({ beginEvent: vi.fn().mockResolvedValue("duplicate") });
    await expect(
      processAndroidBridgeNotification(
        jagoPayload,
        JSON.stringify(jagoPayload),
        deps,
      ),
    ).resolves.toEqual({ status: "duplicate" });
    expect(deps.findMatchingTargets).not.toHaveBeenCalled();
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it("routes equal IDR amounts through their source provider", async () => {
    const danaDeps = dependencies();
    const jagoDeps = dependencies();
    await processAndroidBridgeNotification(
      payload,
      JSON.stringify(payload),
      danaDeps,
    );
    await processAndroidBridgeNotification(
      jagoPayload,
      JSON.stringify(jagoPayload),
      jagoDeps,
    );
    expect(danaDeps.findMatchingTargets).toHaveBeenCalledWith(
      "DANA",
      "id.dana",
      payload.deviceId,
      25_347,
      new Date(payload.postedAt),
    );
    expect(jagoDeps.findMatchingTargets).toHaveBeenCalledWith(
      "JAGO",
      "com.jago.digitalBanking",
      jagoPayload.deviceId,
      25_347,
      new Date(jagoPayload.postedAt),
    );
    const shopeeDeps = dependencies();
    await processAndroidBridgeNotification(
      shopeePayload,
      JSON.stringify(shopeePayload),
      shopeeDeps,
    );
    expect(shopeeDeps.findMatchingTargets).toHaveBeenCalledWith(
      "SHOPEE_PARTNER",
      SHOPEE_PARTNER_ANDROID_PACKAGE,
      shopeePayload.deviceId,
      25_347,
      new Date(shopeePayload.postedAt),
    );
  });

  it("confirms exactly one matching order idempotently", async () => {
    const deps = dependencies();
    await expect(
      processAndroidBridgeNotification(payload, JSON.stringify(payload), deps),
    ).resolves.toEqual({
      status: "confirmed",
      target: { kind: "order", id: "order-1" },
      amount: 25_347,
    });
    expect(deps.confirmPayment).toHaveBeenCalledOnce();
    expect(deps.confirmPayment).toHaveBeenCalledWith(
      { kind: "order", id: "order-1" },
      payload.eventId,
    );
  });

  it("confirms a wallet top up through the same ambiguity-safe matcher", async () => {
    const deps = dependencies({
      findMatchingTargets: vi
        .fn()
        .mockResolvedValue([{ kind: "wallet_topup", id: "topup-1" }]),
    });
    await expect(
      processAndroidBridgeNotification(payload, JSON.stringify(payload), deps),
    ).resolves.toMatchObject({
      status: "confirmed",
      target: { kind: "wallet_topup", id: "topup-1" },
    });
    expect(deps.confirmPayment).toHaveBeenCalledWith(
      { kind: "wallet_topup", id: "topup-1" },
      payload.eventId,
    );
  });

  it("rejects ambiguity without confirming either order", async () => {
    const deps = dependencies({
      findMatchingTargets: vi.fn().mockResolvedValue([
        { kind: "order", id: "order-1" },
        { kind: "wallet_topup", id: "topup-1" },
      ]),
    });
    await expect(
      processAndroidBridgeNotification(payload, JSON.stringify(payload), deps),
    ).resolves.toEqual({ status: "ambiguous" });
    expect(deps.rejectEvent).toHaveBeenCalledWith(
      payload.eventId,
      expect.stringContaining("ambiguous"),
      25_347,
    );
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it("rejects ambiguous Jago invoices without confirming either order", async () => {
    const deps = dependencies({
      findMatchingTargets: vi.fn().mockResolvedValue([
        { kind: "order", id: "jago-order-1" },
        { kind: "order", id: "jago-order-2" },
      ]),
    });
    await expect(
      processAndroidBridgeNotification(
        jagoPayload,
        JSON.stringify(jagoPayload),
        deps,
      ),
    ).resolves.toEqual({ status: "ambiguous" });
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });
});
