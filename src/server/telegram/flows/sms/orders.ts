import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  cancelAllActiveSmsPoolCustomerOrders,
  cancelSmsPoolCustomerOrder,
  refreshSmsPoolCustomerOrder,
} from "@/server/smspool/customer-orders";
import { formatSmsPoolPhoneNumber } from "@/server/smspool/phone";
import { pairSmsCountryButtons } from "@/server/smspool/telegram-layout";
import { formatRupiah } from "@/server/utils/format";
import { smsCountryFlag } from "./format";
import type { SmsNavigationRenderer } from "./types";

const SMS_HISTORY_PAGE_SIZE = 8;

export async function showSmsCustomerOrder(
  render: SmsNavigationRenderer,
  chatId: string,
  orderId: string,
  messageId?: number,
) {
  const order = await refreshSmsPoolCustomerOrder(chatId, orderId);
  if (!order) throw new Error("Order SMS tidak ditemukan");
  const phoneNumber = formatSmsPoolPhoneNumber(order.phoneNumber, order.countryCode);
  const status = order.status === "ACTIVE"
    ? "⏳ Menunggu OTP"
    : order.status === "COMPLETED"
      ? "✅ OTP diterima"
      : order.status === "REFUNDED"
        ? "↩️ Dibatalkan & direfund"
        : order.status === "FAILED"
          ? "⚠️ Gagal · saldo direfund"
          : order.status;
  await render({
    chatId,
    messageId,
    text: [
      "📲 Detail order SMS",
      "",
      `Layanan: ${order.serviceName}`,
      `Negara: ${smsCountryFlag(order.countryCode ?? "")} ${order.countryName}`,
      `Harga: ${formatRupiah(order.sellPrice)}`,
      `Nomor: ${phoneNumber ?? "Sedang diproses"}`,
      `OTP: ${order.otpCode ?? (order.fullCode ? "Tersedia di pesan lengkap" : "Belum masuk")}`,
      order.fullCode && order.fullCode !== order.otpCode ? `Pesan: ${order.fullCode}` : null,
      `Status: ${status}`,
      order.status === "ACTIVE" ? "🔄 OTP diperiksa otomatis setiap sekitar 10 detik." : null,
      order.expiresAt
        ? `Berlaku sampai: ${order.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`
        : null,
    ].filter(Boolean).join("\n"),
    replyMarkup: {
      inline_keyboard: [
        ...(order.status === "ACTIVE"
          ? [
              [{ text: "🔄 Refresh OTP", callback_data: `sms_refresh:${order.id}` }],
              [{ text: "❌ Batalkan & refund", callback_data: `sms_cancel:${order.id}` }],
            ]
          : []),
        [{
          text: order.status === "ACTIVE" || order.status === "PROCESSING"
            ? "📲 Nomor aktif"
            : "📚 Riwayat SMS",
          callback_data: order.status === "ACTIVE" || order.status === "PROCESSING"
            ? "sms_orders"
            : "sms_history:1",
        }],
        [{ text: "⬅️ Menu SMS", callback_data: "sms_services:1" }],
      ],
    },
  });
}

export async function showSmsOrders(
  render: SmsNavigationRenderer,
  chatId: string,
  messageId?: number,
  notice?: string,
  focusOrderIds?: string[],
) {
  const activeWhere = {
    chatId,
    status: { in: ["PROCESSING", "ACTIVE"] },
  } satisfies Prisma.SmsPoolCustomerOrderWhereInput;
  const [orders, cancellableCount] = await Promise.all([
    prisma.smsPoolCustomerOrder.findMany({
      where: {
        ...activeWhere,
        ...(focusOrderIds?.length ? { id: { in: focusOrderIds } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.smsPoolCustomerOrder.count({
      where: { chatId, status: "ACTIVE", refundedAt: null },
    }),
  ]);
  const summary = orders.map((order, index) => {
    const number = formatSmsPoolPhoneNumber(order.phoneNumber, order.countryCode) ?? "Nomor diproses";
    const state = order.status === "ACTIVE" ? "menunggu OTP" : "sedang diproses";
    return `${index + 1}. ${number} · ${state}`;
  });
  const numberRows = pairSmsCountryButtons(
    orders.map((order, index) => ({
      text: `📱 ${formatSmsPoolPhoneNumber(order.phoneNumber, order.countryCode) ?? `Nomor ${index + 1}`}`,
      callback_data: `sms_order:${order.id}`,
    })),
  );
  await render({
    chatId,
    messageId,
    text: [
      notice,
      orders.length
        ? [
            focusOrderIds?.length ? "✅ BULK SMS BERHASIL" : "📲 NOMOR SMS AKTIF",
            "",
            ...summary,
            "",
            "OTP dicek otomatis. Tekan nomor untuk melihat detail.",
          ].join("\n")
        : "📲 Tidak ada nomor SMS aktif.\n\nNomor yang selesai, gagal, atau direfund sudah dipindahkan ke Riwayat.",
    ].filter(Boolean).join("\n\n"),
    replyMarkup: {
      inline_keyboard: [
        ...numberRows,
        ...(cancellableCount > 1
          ? [[{ text: `❌ Batalkan semua ${cancellableCount} nomor aktif`, callback_data: "sms_cancel_all" }]]
          : []),
        [
          { text: "➕ Beli nomor", callback_data: "sms_services:1" },
          { text: "📚 Riwayat", callback_data: "sms_history:1" },
        ],
        [{ text: "⬅️ Menu SMS", callback_data: "sms_services:1" }],
      ],
    },
  });
}

export async function showSmsOrderHistory(
  render: SmsNavigationRenderer,
  chatId: string,
  messageId?: number,
  page = 1,
) {
  const historyWhere = {
    chatId,
    status: { in: ["COMPLETED", "CANCELLED", "REFUNDED", "FAILED"] },
  } satisfies Prisma.SmsPoolCustomerOrderWhereInput;
  const totalItems = await prisma.smsPoolCustomerOrder.count({ where: historyWhere });
  const totalPages = Math.max(1, Math.ceil(totalItems / SMS_HISTORY_PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const orders = await prisma.smsPoolCustomerOrder.findMany({
    where: historyWhere,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * SMS_HISTORY_PAGE_SIZE,
    take: SMS_HISTORY_PAGE_SIZE,
  });
  const statusLabel = (status: string) => status === "COMPLETED"
    ? "✅ OTP diterima"
    : status === "REFUNDED"
      ? "↩️ Refund"
      : status === "CANCELLED"
        ? "❌ Dibatalkan"
        : "⚠️ Gagal";
  const pagination = [
    ...(currentPage > 1
      ? [{ text: "⬅️", callback_data: `sms_history:${currentPage - 1}` }]
      : []),
    { text: `${currentPage}/${totalPages}`, callback_data: `sms_history:${currentPage}` },
    ...(currentPage < totalPages
      ? [{ text: "➡️", callback_data: `sms_history:${currentPage + 1}` }]
      : []),
  ];
  await render({
    chatId,
    messageId,
    text: orders.length
      ? [
          "📚 RIWAYAT SMS",
          "",
          ...orders.map((order, index) =>
            `${(currentPage - 1) * SMS_HISTORY_PAGE_SIZE + index + 1}. ${formatSmsPoolPhoneNumber(order.phoneNumber, order.countryCode) ?? order.serviceName} · ${statusLabel(order.status)}`,
          ),
          "",
          `${totalItems} order lama · Halaman ${currentPage}/${totalPages}`,
        ].join("\n")
      : "📚 Riwayat SMS masih kosong.",
    replyMarkup: {
      inline_keyboard: [
        ...orders.map((order) => [{
          text: `${statusLabel(order.status)} · ${formatSmsPoolPhoneNumber(order.phoneNumber, order.countryCode) ?? order.serviceName}`,
          callback_data: `sms_order:${order.id}`,
        }]),
        ...(totalItems > 0 ? [pagination] : []),
        [
          { text: "📲 Nomor aktif", callback_data: "sms_orders" },
          { text: "➕ Beli nomor", callback_data: "sms_services:1" },
        ],
      ],
    },
  });
}

export async function showSmsCancelAllConfirmation(
  render: SmsNavigationRenderer,
  chatId: string,
  messageId?: number,
) {
  const activeCount = await prisma.smsPoolCustomerOrder.count({
    where: { chatId, status: "ACTIVE", refundedAt: null },
  });
  await render({
    chatId,
    messageId,
    text: `⚠️ Batalkan semua nomor SMS aktif?\n\n${activeCount} nomor akan dicoba dibatalkan. Nomor yang berhasil dibatalkan akan direfund penuh ke wallet.`,
    replyMarkup: {
      inline_keyboard: [
        [{ text: `✅ Ya, batalkan ${activeCount} nomor`, callback_data: "sms_cancel_all_confirm" }],
        [{ text: "⬅️ Jangan batalkan", callback_data: "sms_orders" }],
      ],
    },
  });
}

export async function showSmsCancelConfirmation(
  render: SmsNavigationRenderer,
  chatId: string,
  orderId: string,
  messageId?: number,
) {
  await render({
    chatId,
    messageId,
    text: "⚠️ Batalkan order SMS?\n\nNomor akan dilepas dan harga penuh dikembalikan ke wallet jika pembatalan berhasil.",
    replyMarkup: {
      inline_keyboard: [
        [{ text: "✅ Ya, batalkan & refund", callback_data: `sms_cancel_confirm:${orderId}` }],
        [{ text: "⬅️ Jangan batalkan", callback_data: `sms_order:${orderId}` }],
      ],
    },
  });
}

export async function cancelAllSmsOrders(chatId: string) {
  return cancelAllActiveSmsPoolCustomerOrders(chatId);
}

export async function cancelSmsOrder(chatId: string, orderId: string) {
  return cancelSmsPoolCustomerOrder(chatId, orderId);
}
