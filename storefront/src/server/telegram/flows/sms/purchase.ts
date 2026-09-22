import { prisma } from "@/server/db/prisma";
import { normalizeBuyerIdentity } from "@/server/orders/buyer";
import {
  smsConfirmCallback,
  smsPurchaseCallback,
} from "@/server/smspool/telegram-callback";
import {
  getSmsPoolQuote,
  MAX_SMSPOOL_BULK_QUANTITY,
} from "@/server/smspool/customer-orders";
import { ensureWallet } from "@/server/wallet/ledger";
import { getPaymentMethodAvailability } from "@/server/payment/method-availability";
import { getJagoTransferSetting } from "@/server/payment/jago-transfer-setting";
import { formatRupiah } from "@/server/utils/format";
import { qrisCheckoutReady } from "@/server/payment/qris-invoice";
import { smsCountryFlag } from "./format";
import type { SmsNavigationRenderer, SmsTelegramUser } from "./types";

export async function showSmsQuote(
  render: SmsNavigationRenderer,
  chatId: string,
  serviceId: number,
  countryId: number,
  user?: SmsTelegramUser,
  messageId?: number,
) {
  const identity = normalizeBuyerIdentity({
    username: user?.username,
    firstName: user?.first_name,
    lastName: user?.last_name,
  });
  const [quote, paymentMethods, qrisReady, jago] = await Promise.all([
    getSmsPoolQuote(serviceId, countryId),
    getPaymentMethodAvailability(),
    qrisCheckoutReady(),
    getJagoTransferSetting(),
    ensureWallet(chatId, identity),
  ]);
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { chatId } });
  const bulkQuantities = [1, 3, MAX_SMSPOOL_BULK_QUANTITY].filter(
    (quantity, index, values) =>
      values.indexOf(quantity) === index && wallet.balance >= quote.sellPrice * quantity,
  );
  const enough = paymentMethods.walletCheckoutEnabled && bulkQuantities.length > 0;
  const topupAvailable = paymentMethods.walletCheckoutEnabled &&
    paymentMethods.walletTopupEnabled &&
    ((paymentMethods.qrisDanaEnabled && qrisReady) || jago.enabled);
  await render({
    chatId,
    messageId,
    text: [
      "📲 Konfirmasi nomor SMS",
      "",
      `Layanan: ${quote.service.name}`,
      `Negara: ${smsCountryFlag(quote.country.short_name)} ${quote.country.name}`,
      `Harga: ${formatRupiah(quote.sellPrice)}`,
      `Saldo kamu: ${formatRupiah(wallet.balance)}`,
      "",
      !paymentMethods.walletCheckoutEnabled
        ? "Pembelian SMS menggunakan wallet sedang dinonaktifkan admin."
        : enough
          ? "Pilih jumlah nomor. Setiap nomor memiliki OTP dan tombol refund sendiri."
          : topupAvailable
            ? "Saldo belum cukup. Silakan top up terlebih dahulu."
            : "Saldo belum cukup dan top up wallet sedang dinonaktifkan admin.",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        ...(enough
          ? bulkQuantities.map((quantity) => [{
              text: quantity === 1
                ? `💳 1 nomor · ${formatRupiah(quote.sellPrice)}`
                : `📦 ${quantity} nomor · ${formatRupiah(quote.sellPrice * quantity)}`,
              callback_data: smsConfirmCallback(serviceId, countryId, quantity),
            }])
          : topupAvailable
            ? [[{ text: "➕ Top up saldo", callback_data: "topup" }]]
            : []),
        [
          { text: "⬅️ Ganti negara", callback_data: `sms_quick:${serviceId}` },
          { text: "📱 Ganti aplikasi", callback_data: "sms_services:1" },
        ],
      ],
    },
  });
}

export async function showSmsPurchaseConfirmation(
  render: SmsNavigationRenderer,
  chatId: string,
  serviceId: number,
  countryId: number,
  quantity: number,
  messageId?: number,
) {
  const safeQuantity = Math.min(Math.max(quantity, 1), MAX_SMSPOOL_BULK_QUANTITY);
  const [quote, wallet, paymentMethods, qrisReady, jago] = await Promise.all([
    getSmsPoolQuote(serviceId, countryId),
    prisma.wallet.findUnique({ where: { chatId } }),
    getPaymentMethodAvailability(),
    qrisCheckoutReady(),
    getJagoTransferSetting(),
  ]);
  const total = quote.sellPrice * safeQuantity;
  const enough = paymentMethods.walletCheckoutEnabled && (wallet?.balance ?? 0) >= total;
  const topupAvailable = paymentMethods.walletCheckoutEnabled &&
    paymentMethods.walletTopupEnabled &&
    ((paymentMethods.qrisDanaEnabled && qrisReady) || jago.enabled);
  await render({
    chatId,
    messageId,
    text: [
      "⚠️ Konfirmasi pembelian SMS",
      "",
      `Aplikasi: ${quote.service.name}`,
      `Negara: ${smsCountryFlag(quote.country.short_name)} ${quote.country.name}`,
      `Jumlah: ${safeQuantity} nomor`,
      `Total: ${formatRupiah(total)}`,
      `Saldo setelah pembelian: ${formatRupiah(Math.max(0, (wallet?.balance ?? 0) - total))}`,
      "",
      !paymentMethods.walletCheckoutEnabled
        ? "Pembelian SMS menggunakan wallet sedang dinonaktifkan admin."
        : enough
          ? "Wallet baru dipotong setelah tombol konfirmasi di bawah ditekan."
          : topupAvailable
            ? "Saldo tidak cukup. Silakan top up terlebih dahulu."
            : "Saldo tidak cukup dan top up wallet sedang dinonaktifkan admin.",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        ...(enough
          ? [[{
              text: `✅ Bayar ${formatRupiah(total)} & pesan`,
              callback_data: smsPurchaseCallback(serviceId, countryId, safeQuantity),
            }]]
          : topupAvailable
            ? [[{ text: "➕ Top up saldo", callback_data: "topup" }]]
            : []),
        [{ text: "⬅️ Ubah jumlah", callback_data: `sms_country:${serviceId}:${countryId}` }],
        [{ text: "🌍 Ganti negara", callback_data: `sms_quick:${serviceId}` }],
      ],
    },
  });
}
