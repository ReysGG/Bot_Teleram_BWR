import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { webCustomerChatId } from "@/server/storefront/customer-access";
import { canAccessWebProductResources } from "@/server/storefront/product-resource-access";
import { webProductGuidance } from "@/server/storefront/product-guidance";

export async function webCustomerWalletBalance(customerId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { chatId: webCustomerChatId(customerId) },
    select: { balance: true },
  });
  return wallet?.balance ?? 0;
}

function usdtMicrosText(value: bigint) {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function deliveryState(input: {
  orderStatus: string;
  paymentStatus: string;
  receipts: Array<{ status: string }>;
}) {
  if (input.orderStatus === "REFUNDED") return "REFUNDED" as const;
  if (input.orderStatus === "CANCELLED") return "CANCELLED" as const;
  if (input.orderStatus === "EXPIRED") return "EXPIRED" as const;
  if (input.paymentStatus !== "PAID") return "WAITING_PAYMENT" as const;
  if (input.receipts.some((receipt) => receipt.status === "READY")) {
    return "READY" as const;
  }
  if (
    input.receipts.length > 0 &&
    input.receipts.every((receipt) => receipt.status === "SENT")
  ) {
    return "DELIVERED" as const;
  }
  return "PROCESSING" as const;
}

const webOrderListSelect = {
  id: true, invoiceNumber: true, createdAt: true, expiresAt: true, paidAt: true, completedAt: true,
  status: true, paymentStatus: true, grandTotal: true,
  payment: { select: { method: true, billedAmount: true } },
  items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { productNameSnapshot: true, variantLabelSnapshot: true } },
  deliveryReceipts: { where: { channel: "WEB" }, select: { status: true } },
} satisfies Prisma.OrderSelect;

function webOrderView(order: Prisma.OrderGetPayload<{ select: typeof webOrderListSelect }>) {
  const firstItem = order.items[0];
  return {
    id: order.id,
    invoiceNumber: order.invoiceNumber,
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.expiresAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.payment?.method ?? null,
    billedAmount: order.payment?.billedAmount ?? order.grandTotal,
    grandTotal: order.grandTotal,
    productName: firstItem?.productNameSnapshot ?? "Produk digital",
    variantLabel: firstItem?.variantLabelSnapshot ?? null,
    quantity: order.items.length,
    deliveryState: deliveryState({
      orderStatus: order.status,
      paymentStatus: order.paymentStatus,
      receipts: order.deliveryReceipts,
    }),
    readyFiles: order.deliveryReceipts.filter((receipt) => receipt.status === "READY").length,
    deliveredFiles: order.deliveryReceipts.filter((receipt) => receipt.status === "SENT").length,
  };
}

function loadWebOrderRecord(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      payment: true,
      items: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: {
          product: {
            select: {
              name: true,
              attachmentOriginalFilename: true,
              attachmentEncryptedPayload: true,
              attachmentEncryptionIv: true,
              attachmentEncryptionTag: true,
              postDeliveryInstructions: true,
              postDeliveryEntities: true,
              redeemUrl: true,
            },
          },
        },
      },
      deliveryReceipts: {
        where: { channel: "WEB" },
        select: {
          id: true,
          status: true,
          stockItemId: true,
          downloadCount: true,
          lastDownloadedAt: true,
          stockItem: { select: { originalFilename: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      qrisInvoiceAttempt: true,
      jagoTransferAttempt: true,
      binanceInternalPaymentAttempt: true,
      usdtBep20Attempt: true,
    },
  });
}

export async function listWebCustomerOrders(customerId: string) {
  const orders = await prisma.order.findMany({
    where: { webCustomerId: customerId, channel: "WEB" },
    select: webOrderListSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return orders.map(webOrderView);
}

export async function getWebCustomerOrder(customerId: string, invoiceNumber: string) {
  const order = await prisma.order.findFirst({
    where: {
      invoiceNumber: invoiceNumber.trim().toUpperCase(),
      webCustomerId: customerId,
      channel: "WEB",
    },
    select: { id: true },
  });
  if (!order) return null;
  const record = await loadWebOrderRecord(order.id);
  const summary = webOrderView(record);
  const method = record.payment?.method ?? null;
  const canAccessProductResources = canAccessWebProductResources({
    channel: record.channel,
    paymentStatus: record.paymentStatus,
    orderStatus: record.status,
  });
  const paymentInstructions = method === "DANA_RELAY" || method === "WALLET_QRIS"
    ? {
        type: "QRIS" as const,
        amount: record.payment?.billedAmount ?? record.grandTotal,
        imagePath: `/api/storefront/v1/orders/${encodeURIComponent(record.invoiceNumber)}/qris`,
      }
    : method === "JAGO_TRANSFER" && record.jagoTransferAttempt
      ? {
          type: "JAGO_TRANSFER" as const,
          amount: record.payment?.billedAmount ?? record.grandTotal,
          accountNumber: record.jagoTransferAttempt.recipientAccountNumberSnapshot,
        }
      : method === "BINANCE_INTERNAL" && record.binanceInternalPaymentAttempt
        ? {
            type: "BINANCE_INTERNAL" as const,
            recipientId: record.binanceInternalPaymentAttempt.recipientBinanceIdSnapshot,
            amountUsdt: usdtMicrosText(record.binanceInternalPaymentAttempt.expectedUsdtMicros),
            status: record.binanceInternalPaymentAttempt.status,
            submittedOrderId: record.binanceInternalPaymentAttempt.submittedOrderId,
          }
        : method === "USDT_BEP20" && record.usdtBep20Attempt
          ? {
              type: "USDT_BEP20" as const,
              recipientAddress: record.usdtBep20Attempt.recipientAddressSnapshot,
              tokenContract: record.usdtBep20Attempt.tokenContractSnapshot,
              chainId: record.usdtBep20Attempt.chainIdSnapshot,
              amountUsdt: usdtMicrosText(record.usdtBep20Attempt.expectedUsdtMicros),
              status: record.usdtBep20Attempt.status,
              txHash: record.usdtBep20Attempt.txHash,
              confirmations: record.usdtBep20Attempt.confirmations,
              requiredConfirmations: record.usdtBep20Attempt.requiredConfirmationsSnapshot,
            }
          : method === "WALLET"
            ? { type: "WALLET" as const, amount: record.grandTotal }
            : null;
  return {
    ...summary,
    paymentInstructions,
    guidance: webProductGuidance({ channel: record.channel, paymentStatus: record.paymentStatus, orderStatus: record.status, items: record.items }),
    attachments: canAccessProductResources
      ? [...new Map(record.items.flatMap((item) =>
          item.product.attachmentOriginalFilename &&
          item.product.attachmentEncryptedPayload &&
          item.product.attachmentEncryptionIv &&
          item.product.attachmentEncryptionTag
            ? [[item.productId, {
                productId: item.productId,
                productName: item.productNameSnapshot,
                filename: item.product.attachmentOriginalFilename,
                downloadPath: `/api/storefront/v1/orders/${encodeURIComponent(record.invoiceNumber)}/attachments/${encodeURIComponent(item.productId)}`,
              }] as const]
            : [],
        )).values()]
      : [],
    deliveries: record.deliveryReceipts.map((receipt, index) => ({
      id: receipt.id,
      unitNumber: index + 1,
      filename: receipt.stockItem.originalFilename,
      status: receipt.status,
      downloadCount: receipt.downloadCount,
      lastDownloadedAt: receipt.lastDownloadedAt?.toISOString() ?? null,
      downloadPath: `/api/storefront/v1/orders/${encodeURIComponent(record.invoiceNumber)}/deliveries/${encodeURIComponent(receipt.id)}`,
    })),
  };
}

export async function pageWebCustomerOrders(customerId: string, input: { page?: string; q?: string; status?: string }) {
  const q = (input.q ?? "").trim().slice(0, 100);
  const status = ["pending", "success", "expired"].includes(input.status ?? "") ? input.status! : "all";
  const owner: Prisma.OrderWhereInput = { webCustomerId: customerId, channel: "WEB" };
  const where: Prisma.OrderWhereInput = { ...owner,
    ...(status === "pending" ? { status: "PENDING_PAYMENT" } : status === "expired" ? { status: "EXPIRED" } : status === "success" ? { paymentStatus: "PAID", status: { notIn: ["REFUNDED", "CANCELLED", "EXPIRED"] } } : {}),
    ...(q ? { OR: [{ invoiceNumber: { contains: q, mode: "insensitive" } }, { items: { some: { productNameSnapshot: { contains: q, mode: "insensitive" } } } }] } : {}),
  };
  const [total, totalOrders, pendingCount] = await Promise.all([
    prisma.order.count({ where }), prisma.order.count({ where: owner }),
    prisma.order.count({ where: { ...owner, status: "PENDING_PAYMENT" } }),
  ]);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requested = Number(input.page);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, totalPages) : 1;
  const rows = await prisma.order.findMany({ where, select: webOrderListSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize });
  return { orders: rows.map(webOrderView), pagination: { page, totalPages, total, totalOrders, pendingCount, pageSize, q, status } };
}
