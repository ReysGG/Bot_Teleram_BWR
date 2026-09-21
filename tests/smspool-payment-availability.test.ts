import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    smsPoolCustomerOrder: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    storeRuntimeSetting: {
      findUnique: vi.fn(),
    },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    ensureWallet: vi.fn(),
    applyWalletTransaction: vi.fn(),
    purchaseSmsPoolNumber: vi.fn(),
    getSmsPoolServices: vi.fn(),
    getSmsPoolSuccessRates: vi.fn(),
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/server/wallet/ledger", () => ({
  ensureWallet: mocks.ensureWallet,
  applyWalletTransaction: mocks.applyWalletTransaction,
}));

vi.mock("@/server/smspool/client", () => ({
  calculateSmsPoolSellPrice: vi.fn(() => 5_000),
  cancelSmsPoolOrder: vi.fn(),
  checkSmsPoolOrder: vi.fn(),
  getSmsPoolActiveOrders: vi.fn(),
  getSmsPoolHistory: vi.fn(),
  getSmsPoolServices: mocks.getSmsPoolServices,
  getSmsPoolSuccessRates: mocks.getSmsPoolSuccessRates,
  purchaseSmsPoolNumber: mocks.purchaseSmsPoolNumber,
  resolveSmsPoolPurchaseCostUsd: vi.fn(),
  smsPoolProviderPriceFloor: vi.fn(() => 0.2),
  SMSPOOL_NO_NUMBERS_MESSAGE: "Nomor tidak tersedia",
  SMSPOOL_UNAVAILABLE_MESSAGE: "Layanan SMS sedang maintenance",
}));

import { purchaseSmsPoolForCustomer } from "@/server/smspool/customer-orders";

describe("SMSPool wallet payment availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSmsPoolServices.mockResolvedValue([{ ID: 1, name: "OpenAI" }]);
    mocks.getSmsPoolSuccessRates.mockResolvedValue([{
      country_id: 6,
      name: "Indonesia",
      short_name: "ID",
    }]);
    mocks.tx.smsPoolCustomerOrder.findUnique.mockResolvedValue(null);
    mocks.tx.storeRuntimeSetting.findUnique.mockResolvedValue({
      qrisDanaEnabled: true,
      walletCheckoutEnabled: false,
      mixedWalletQrisEnabled: true,
      walletTopupEnabled: true,
      usdtBep20Enabled: false,
      binanceInternalEnabled: false,
      jagoTransferEnabled: false,
      paymentMethodsUpdatedAt: null,
      paymentMethodsUpdatedBy: null,
    });
  });

  it("rejects stale SMS purchase callbacks before wallet debit or provider order", async () => {
    await expect(purchaseSmsPoolForCustomer({
      chatId: "7398144015",
      serviceId: 1,
      countryId: 6,
      idempotencyKey: "telegram-sms:disabled-wallet",
    })).rejects.toThrow("Pembayaran menggunakan saldo wallet sedang dinonaktifkan admin.");

    expect(mocks.applyWalletTransaction).not.toHaveBeenCalled();
    expect(mocks.tx.smsPoolCustomerOrder.create).not.toHaveBeenCalled();
    expect(mocks.purchaseSmsPoolNumber).not.toHaveBeenCalled();
  });
});
