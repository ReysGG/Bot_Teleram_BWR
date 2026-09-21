import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { getBinanceInternalSetting } from "@/server/payment/binance-internal-setting";
import { getJagoTransferSetting } from "@/server/payment/jago-transfer-setting";
import { getUsdtBep20Setting } from "@/server/payment/usdt-bep20-setting";
import { resolveQrisCheckoutMerchant } from "@/server/payment/qris-merchant-service";
import { qrisProviderUnavailableReason } from "@/server/payment/qris-provider-health";

const STORE_RUNTIME_ID = "global";

export type CheckoutPaymentMethod =
  | "DANA"
  | "WALLET"
  | "WALLET_QRIS"
  | "USDT_BEP20"
  | "BINANCE_INTERNAL"
  | "JAGO_TRANSFER";

export type PaymentMethodAvailabilityClient = Pick<
  Prisma.TransactionClient,
  "storeRuntimeSetting" | "binanceWebSession" | "qrisMerchant" | "shopeePartnerSession"
>;

export type PaymentMethodAvailabilityWriteClient = Pick<
  Prisma.TransactionClient,
  "storeRuntimeSetting" | "qrisMerchant" | "binanceWebSession"
>;

export type PaymentMethodAvailability = {
  qrisDanaEnabled: boolean;
  walletCheckoutEnabled: boolean;
  mixedWalletQrisEnabled: boolean;
  walletTopupEnabled: boolean;
  usdtBep20Enabled: boolean;
  binanceInternalEnabled: boolean;
  jagoTransferEnabled: boolean;
  updatedAt: Date | null;
  updatedBy: string | null;
  qrisUnavailableReason?: string | null;
};

export async function getPaymentMethodAvailability(
  client: PaymentMethodAvailabilityClient = prisma,
  options: { configuredOnly?: boolean } = {},
): Promise<PaymentMethodAvailability> {
  const setting = await client.storeRuntimeSetting.findUnique({
    where: { id: STORE_RUNTIME_ID },
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
  const availability: PaymentMethodAvailability = {
    qrisDanaEnabled: setting?.qrisDanaEnabled ?? true,
    walletCheckoutEnabled: setting?.walletCheckoutEnabled ?? true,
    mixedWalletQrisEnabled: setting?.mixedWalletQrisEnabled ?? true,
    walletTopupEnabled: setting?.walletTopupEnabled ?? true,
    usdtBep20Enabled: setting?.usdtBep20Enabled ?? false,
    binanceInternalEnabled: setting?.binanceInternalEnabled ?? false,
    jagoTransferEnabled: setting?.jagoTransferEnabled ?? false,
    updatedAt: setting?.paymentMethodsUpdatedAt ?? null,
    updatedBy: setting?.paymentMethodsUpdatedBy ?? null,
  };
  const reason = availability.qrisDanaEnabled ? await qrisProviderUnavailableReason(client) : null;
  if (!reason) return availability;
  if (options.configuredOnly) return { ...availability, qrisUnavailableReason: reason };
  return { ...availability, qrisDanaEnabled:false, mixedWalletQrisEnabled:false,
    walletTopupEnabled:availability.walletTopupEnabled && availability.jagoTransferEnabled,
    qrisUnavailableReason:reason };
}

export async function setPaymentMethodAvailability(
  input: Omit<PaymentMethodAvailability, "updatedAt" | "updatedBy"> & {
    actor: string;
  },
  client: PaymentMethodAvailabilityWriteClient = prisma,
) {
  if (
    input.mixedWalletQrisEnabled &&
    (!input.walletCheckoutEnabled || !input.qrisDanaEnabled)
  ) {
    throw new Error("Wallet + QRIS memerlukan wallet checkout dan QRIS/DANA aktif.");
  }
  if (
    input.walletTopupEnabled &&
    (!input.walletCheckoutEnabled ||
      (!input.qrisDanaEnabled && !input.jagoTransferEnabled))
  ) {
    throw new Error(
      "Top up wallet memerlukan wallet checkout dan minimal satu provider Rupiah aktif (QRIS/DANA atau Bank Jago).",
    );
  }
  const [qrisMerchant, binance, jago, bep20] = await Promise.all([
    input.qrisDanaEnabled ? resolveQrisCheckoutMerchant(client) : null,
    input.binanceInternalEnabled ? getBinanceInternalSetting(client) : null,
    input.jagoTransferEnabled ? getJagoTransferSetting(client) : null,
    input.usdtBep20Enabled ? getUsdtBep20Setting(client) : null,
  ]);
  if (input.qrisDanaEnabled && !qrisMerchant) {
    throw new Error(
      "Aktifkan merchant QRIS yang siap. Fallback payload legacy hanya berlaku sebelum merchant database pertama dibuat.",
    );
  }
  if (binance && (!binance.recipientId || !binance.verifierReady)) {
    throw new Error("Konfigurasi Binance Pay belum lengkap.");
  }
  if (jago && !jago.accountNumber) {
    throw new Error("Nomor rekening Bank Jago belum dikonfigurasi.");
  }
  if (bep20 && (!bep20.recipientAddress || !bep20.rpc.url)) {
    throw new Error("Konfigurasi USDT BEP20 belum lengkap.");
  }
  const updatedAt = new Date();
  const data = {
    qrisDanaEnabled: input.qrisDanaEnabled,
    walletCheckoutEnabled: input.walletCheckoutEnabled,
    mixedWalletQrisEnabled: input.mixedWalletQrisEnabled,
    walletTopupEnabled: input.walletTopupEnabled,
    usdtBep20Enabled: input.usdtBep20Enabled,
    binanceInternalEnabled: input.binanceInternalEnabled,
    jagoTransferEnabled: input.jagoTransferEnabled,
    paymentMethodsUpdatedAt: updatedAt,
    paymentMethodsUpdatedBy: input.actor,
  };
  return client.storeRuntimeSetting.upsert({
    where: { id: STORE_RUNTIME_ID },
    create: { id: STORE_RUNTIME_ID, ...data },
    update: data,
  });
}

export function paymentMethodDisabledReason(
  method: CheckoutPaymentMethod,
  setting: PaymentMethodAvailability,
): string | null {
  if (method === "DANA" && !setting.qrisDanaEnabled) {
    if (setting.qrisUnavailableReason) return "QRIS Shopee sementara tidak tersedia karena koneksi pembayaran perlu diperiksa. Pilih metode lain.";
    return "Pembayaran QRIS/DANA sedang dinonaktifkan admin.";
  }
  if (method === "WALLET" && !setting.walletCheckoutEnabled) {
    return "Pembayaran menggunakan saldo wallet sedang dinonaktifkan admin.";
  }
  if (
    method === "WALLET_QRIS" &&
    (!setting.walletCheckoutEnabled ||
      !setting.qrisDanaEnabled ||
      !setting.mixedWalletQrisEnabled)
  ) {
    return "Pembayaran gabungan saldo + QRIS sedang dinonaktifkan admin.";
  }
  if (method === "USDT_BEP20" && !setting.usdtBep20Enabled) {
    return "Pembayaran USDT BEP20 sedang dinonaktifkan admin.";
  }
  if (method === "BINANCE_INTERNAL" && !setting.binanceInternalEnabled) {
    return "Pembayaran Binance Pay sedang dinonaktifkan admin.";
  }
  if (method === "JAGO_TRANSFER" && !setting.jagoTransferEnabled) {
    return "Pembayaran transfer Bank Jago sedang dinonaktifkan admin.";
  }
  return null;
}

export function assertCheckoutPaymentMethodEnabled(
  method: CheckoutPaymentMethod,
  setting: PaymentMethodAvailability,
) {
  const reason = paymentMethodDisabledReason(method, setting);
  if (reason) throw new Error(reason);
}
