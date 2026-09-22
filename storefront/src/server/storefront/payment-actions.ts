import { prisma } from "@/server/db/prisma";
import {
  refreshBinanceInternalVerification,
  submitBinanceInternalOrderId,
} from "@/server/payment/binance-internal";
import {
  refreshUsdtBep20Verification,
  submitUsdtBep20Transaction,
} from "@/server/payment/usdt-bep20";
import { getWebCustomerOrder } from "@/server/storefront/orders";
import { cancelPendingOrder } from "@/server/payment/cancel-order";

export async function submitWebPaymentReference(input: {
  customerId: string;
  invoiceNumber: string;
  value: string;
}) {
  const order = await prisma.order.findFirst({
    where: {
      invoiceNumber: input.invoiceNumber.trim().toUpperCase(),
      webCustomerId: input.customerId,
      channel: "WEB",
    },
    select: { id: true, invoiceNumber: true, chatId: true, payment: { select: { method: true } } },
  });
  if (!order?.payment) throw new Error("Order tidak ditemukan");
  if (order.payment.method === "BINANCE_INTERNAL") {
    await submitBinanceInternalOrderId({
      orderId: order.id,
      chatId: order.chatId,
      submittedOrderId: input.value,
    });
  } else if (order.payment.method === "USDT_BEP20") {
    await submitUsdtBep20Transaction({
      orderId: order.id,
      chatId: order.chatId,
      txHash: input.value,
    });
  } else {
    throw new Error("Order ini tidak memerlukan referensi pembayaran");
  }
  return getWebCustomerOrder(input.customerId, order.invoiceNumber);
}

export async function refreshWebPayment(input: {
  customerId: string;
  invoiceNumber: string;
}) {
  const order = await prisma.order.findFirst({
    where: {
      invoiceNumber: input.invoiceNumber.trim().toUpperCase(),
      webCustomerId: input.customerId,
      channel: "WEB",
    },
    select: { id: true, invoiceNumber: true, chatId: true, payment: { select: { method: true } } },
  });
  if (!order?.payment) throw new Error("Order tidak ditemukan");
  if (order.payment.method === "BINANCE_INTERNAL") {
    await refreshBinanceInternalVerification({ orderId: order.id, chatId: order.chatId });
  } else if (order.payment.method === "USDT_BEP20") {
    await refreshUsdtBep20Verification({ orderId: order.id, chatId: order.chatId });
  }
  return getWebCustomerOrder(input.customerId, order.invoiceNumber);
}

export async function cancelWebOrder(input: {
  customerId: string;
  invoiceNumber: string;
}) {
  const order = await prisma.order.findFirst({
    where: {
      invoiceNumber: input.invoiceNumber.trim().toUpperCase(),
      webCustomerId: input.customerId,
      channel: "WEB",
    },
    select: { id: true, invoiceNumber: true, chatId: true },
  });
  if (!order) throw new Error("Order tidak ditemukan");
  await cancelPendingOrder({ orderId: order.id, chatId: order.chatId });
  return getWebCustomerOrder(input.customerId, order.invoiceNumber);
}
