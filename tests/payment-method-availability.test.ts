import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertCheckoutPaymentMethodEnabled,
  getPaymentMethodAvailability,
  paymentMethodDisabledReason,
  setPaymentMethodAvailability,
  type CheckoutPaymentMethod,
  type PaymentMethodAvailability,
  type PaymentMethodAvailabilityClient,
  type PaymentMethodAvailabilityWriteClient,
} from "@/server/payment/method-availability";

const qrisMocks = vi.hoisted(() => ({
  resolve: vi.fn(),
}));

vi.mock("@/server/payment/qris-merchant-service", () => ({
  resolveQrisCheckoutMerchant: qrisMocks.resolve,
}));

function availability(
  overrides: Partial<PaymentMethodAvailability> = {},
): PaymentMethodAvailability {
  return {
    qrisDanaEnabled: true,
    walletCheckoutEnabled: true,
    mixedWalletQrisEnabled: true,
    walletTopupEnabled: true,
    usdtBep20Enabled: true,
    binanceInternalEnabled: true,
    jagoTransferEnabled: true,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

function mockClient() {
  const findUnique = vi.fn();
  const upsert = vi.fn();
  const findBinanceWebSession = vi.fn().mockResolvedValue(null);
  return {
    client: {
      storeRuntimeSetting: { findUnique, upsert },
      qrisMerchant: { findFirst: vi.fn() },
      binanceWebSession: { findFirst: findBinanceWebSession },
    } as unknown as PaymentMethodAvailabilityClient & PaymentMethodAvailabilityWriteClient,
    findUnique,
    findBinanceWebSession,
    upsert,
  };
}

describe("payment method availability", () => {
  beforeEach(() => {
    qrisMocks.resolve.mockReset();
    qrisMocks.resolve.mockResolvedValue({ providerKey: "DANA" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("uses safe defaults when the global setting does not exist", async () => {
    const { client, findUnique } = mockClient();
    findUnique.mockResolvedValue(null);

    await expect(getPaymentMethodAvailability(client)).resolves.toEqual({
      qrisDanaEnabled: true,
      walletCheckoutEnabled: true,
      mixedWalletQrisEnabled: true,
      walletTopupEnabled: true,
      usdtBep20Enabled: false,
      binanceInternalEnabled: false,
      jagoTransferEnabled: false,
      updatedAt: null,
      updatedBy: null,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "global" },
      select: {
        qrisDanaEnabled: true,
        walletCheckoutEnabled: true,
        mixedWalletQrisEnabled: true,
        walletTopupEnabled: true,
        usdtBep20Enabled: true,
        binanceInternalEnabled: true,
        jagoTransferEnabled: true,
        paymentMethodsUpdatedAt: true,
        paymentMethodsUpdatedBy: true,
      },
    });
  });

  it("rejects enabling QRIS when no active merchant or valid legacy snapshot exists", async () => {
    const { client, upsert } = mockClient();
    qrisMocks.resolve.mockResolvedValueOnce(null);

    await expect(setPaymentMethodAvailability({
      qrisDanaEnabled: true,
      walletCheckoutEnabled: true,
      mixedWalletQrisEnabled: false,
      walletTopupEnabled: false,
      usdtBep20Enabled: false,
      binanceInternalEnabled: false,
      jagoTransferEnabled: false,
      actor: "admin:test",
    }, client)).rejects.toThrow("Aktifkan merchant QRIS");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("maps the stored setting to the public availability shape", async () => {
    const { client, findUnique } = mockClient();
    const updatedAt = new Date("2026-08-22T05:00:00.000Z");
    findUnique.mockResolvedValue({
      qrisDanaEnabled: false,
      walletCheckoutEnabled: false,
      mixedWalletQrisEnabled: false,
      walletTopupEnabled: false,
      usdtBep20Enabled: true,
      binanceInternalEnabled: true,
      jagoTransferEnabled: true,
      paymentMethodsUpdatedAt: updatedAt,
      paymentMethodsUpdatedBy: "admin:owner@example.test",
    });

    await expect(getPaymentMethodAvailability(client)).resolves.toEqual({
      qrisDanaEnabled: false,
      walletCheckoutEnabled: false,
      mixedWalletQrisEnabled: false,
      walletTopupEnabled: false,
      usdtBep20Enabled: true,
      binanceInternalEnabled: true,
      jagoTransferEnabled: true,
      updatedAt,
      updatedBy: "admin:owner@example.test",
    });
  });

  it("persists every method toggle and one shared audit timestamp", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-08-22T06:30:00.000Z");
    vi.setSystemTime(now);
    const { client, upsert } = mockClient();
    upsert.mockResolvedValue({ id: "global" });

    await setPaymentMethodAvailability(
      {
        qrisDanaEnabled: true,
        walletCheckoutEnabled: true,
        mixedWalletQrisEnabled: false,
        walletTopupEnabled: true,
        usdtBep20Enabled: false,
        binanceInternalEnabled: false,
        jagoTransferEnabled: false,
        actor: "admin:owner@example.test",
      },
      client,
    );

    const expectedData = {
      qrisDanaEnabled: true,
      walletCheckoutEnabled: true,
      mixedWalletQrisEnabled: false,
      walletTopupEnabled: true,
      usdtBep20Enabled: false,
      binanceInternalEnabled: false,
      jagoTransferEnabled: false,
      paymentMethodsUpdatedAt: now,
      paymentMethodsUpdatedBy: "admin:owner@example.test",
    };
    expect(upsert).toHaveBeenCalledWith({
      where: { id: "global" },
      create: { id: "global", ...expectedData },
      update: expectedData,
    });
  });

  it("rejects mixed checkout when wallet or QRIS is disabled", async () => {
    const { client, upsert } = mockClient();
    await expect(setPaymentMethodAvailability({
      qrisDanaEnabled: false,
      walletCheckoutEnabled: true,
      mixedWalletQrisEnabled: true,
      walletTopupEnabled: true,
      usdtBep20Enabled: false,
      binanceInternalEnabled: false,
      jagoTransferEnabled: false,
      actor: "admin:test",
    }, client)).rejects.toThrow("Wallet + QRIS memerlukan");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("allows wallet top up with Bank Jago when QRIS/DANA is disabled", async () => {
    const { client, findUnique, upsert } = mockClient();
    findUnique.mockResolvedValue({
      jagoTransferEnabled: true,
      jagoTransferAccountNumber: "109331259936",
      jagoTransferUpdatedAt: null,
      jagoTransferUpdatedBy: null,
    });
    upsert.mockResolvedValue({ id: "global" });

    await expect(setPaymentMethodAvailability({
      qrisDanaEnabled: false,
      walletCheckoutEnabled: true,
      mixedWalletQrisEnabled: false,
      walletTopupEnabled: true,
      usdtBep20Enabled: false,
      binanceInternalEnabled: false,
      jagoTransferEnabled: true,
      actor: "admin:test",
    }, client)).resolves.toEqual({ id: "global" });
  });

  it("rejects wallet top up without wallet checkout or an active Rupiah provider", async () => {
    const { client, upsert } = mockClient();
    await expect(setPaymentMethodAvailability({
      qrisDanaEnabled: false,
      walletCheckoutEnabled: true,
      mixedWalletQrisEnabled: false,
      walletTopupEnabled: true,
      usdtBep20Enabled: false,
      binanceInternalEnabled: false,
      jagoTransferEnabled: false,
      actor: "admin:test",
    }, client)).rejects.toThrow("minimal satu provider Rupiah aktif");
    await expect(setPaymentMethodAvailability({
      qrisDanaEnabled: true,
      walletCheckoutEnabled: false,
      mixedWalletQrisEnabled: false,
      walletTopupEnabled: true,
      usdtBep20Enabled: false,
      binanceInternalEnabled: false,
      jagoTransferEnabled: false,
      actor: "admin:test",
    }, client)).rejects.toThrow("Top up wallet memerlukan wallet checkout");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects enabling external providers whose server configuration is incomplete", async () => {
    vi.stubEnv("BINANCE_API_KEY", "");
    vi.stubEnv("BINANCE_API_SECRET", "");
    vi.stubEnv("BINANCE_PAY_RECIPIENT_ID", "");
    const { client, findUnique, upsert } = mockClient();
    findUnique.mockResolvedValue({
      binanceInternalEnabled: false,
      binanceInternalRecipientId: "567896636",
      binanceInternalUpdatedAt: null,
      binanceInternalUpdatedBy: null,
    });

    await expect(setPaymentMethodAvailability({
      qrisDanaEnabled: true,
      walletCheckoutEnabled: true,
      mixedWalletQrisEnabled: true,
      walletTopupEnabled: true,
      usdtBep20Enabled: false,
      binanceInternalEnabled: true,
      jagoTransferEnabled: false,
      actor: "admin:test",
    }, client)).rejects.toThrow("Konfigurasi Binance Pay belum lengkap");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("allows Binance Pay readiness from a validated primary web session without API credentials", async () => {
    vi.stubEnv("BINANCE_API_KEY", "");
    vi.stubEnv("BINANCE_API_SECRET", "");
    vi.stubEnv("BINANCE_WEB_SESSION_CHECKOUT_ENABLED", "true");
    const { client, findUnique, findBinanceWebSession, upsert } = mockClient();
    findUnique.mockResolvedValue({
      binanceInternalEnabled: false,
      binanceInternalRecipientId: "567896636",
      binanceInternalUpdatedAt: null,
      binanceInternalUpdatedBy: null,
    });
    findBinanceWebSession.mockResolvedValue({
      id: "session-1",
      name: "Primary Binance",
      accountFingerprint: "a".repeat(64),
      lastValidatedAt: new Date(),
      lastSuccessfulPollAt: new Date(),
    });

    await expect(setPaymentMethodAvailability({
      qrisDanaEnabled: true,
      walletCheckoutEnabled: true,
      mixedWalletQrisEnabled: true,
      walletTopupEnabled: true,
      usdtBep20Enabled: false,
      binanceInternalEnabled: true,
      jagoTransferEnabled: false,
      actor: "admin:test",
    }, client)).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalled();
  });

  it.each<{
    method: CheckoutPaymentMethod;
    override: Partial<PaymentMethodAvailability>;
    reason: string;
  }>([
    {
      method: "DANA",
      override: { qrisDanaEnabled: false },
      reason: "Pembayaran QRIS/DANA sedang dinonaktifkan admin.",
    },
    {
      method: "WALLET",
      override: { walletCheckoutEnabled: false },
      reason: "Pembayaran menggunakan saldo wallet sedang dinonaktifkan admin.",
    },
    {
      method: "WALLET_QRIS",
      override: { mixedWalletQrisEnabled: false },
      reason: "Pembayaran gabungan saldo + QRIS sedang dinonaktifkan admin.",
    },
    {
      method: "USDT_BEP20",
      override: { usdtBep20Enabled: false },
      reason: "Pembayaran USDT BEP20 sedang dinonaktifkan admin.",
    },
    {
      method: "BINANCE_INTERNAL",
      override: { binanceInternalEnabled: false },
      reason: "Pembayaran Binance Pay sedang dinonaktifkan admin.",
    },
    {
      method: "JAGO_TRANSFER",
      override: { jagoTransferEnabled: false },
      reason: "Pembayaran transfer Bank Jago sedang dinonaktifkan admin.",
    },
  ])("rejects disabled $method checkout", ({ method, override, reason }) => {
    const setting = availability(override);

    expect(paymentMethodDisabledReason(method, setting)).toBe(reason);
    expect(() => assertCheckoutPaymentMethodEnabled(method, setting)).toThrow(reason);
  });

  it.each([
    { walletCheckoutEnabled: false },
    { qrisDanaEnabled: false },
    { mixedWalletQrisEnabled: false },
  ])("requires wallet, QRIS, and mixed toggles for WALLET_QRIS", (override) => {
    expect(
      paymentMethodDisabledReason("WALLET_QRIS", availability(override)),
    ).toBe("Pembayaran gabungan saldo + QRIS sedang dinonaktifkan admin.");
  });

  it.each<CheckoutPaymentMethod>([
    "DANA",
    "WALLET",
    "WALLET_QRIS",
    "USDT_BEP20",
    "BINANCE_INTERNAL",
    "JAGO_TRANSFER",
  ])("allows enabled %s checkout", (method) => {
    const setting = availability();

    expect(paymentMethodDisabledReason(method, setting)).toBeNull();
    expect(() => assertCheckoutPaymentMethodEnabled(method, setting)).not.toThrow();
  });
});
