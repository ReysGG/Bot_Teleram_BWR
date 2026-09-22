import { Prisma } from "@/generated/prisma/client";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { normalizeNotificationFilterStatus } from "@/server/admin/status-filter";
import { prisma } from "@/server/db/prisma";
import { booleanEnv } from "@/server/env";
import { sellableStockWhere } from "@/server/stock/sellable";
import { deliveryFeedbackState } from "@/server/telegram/delivery-feedback";
import { adminWebCustomerSelect, withAdminWebBuyer } from "@/server/admin/web-buyer";

const orderDetailInclude = {
  webCustomer: adminWebCustomerSelect,
  payment: true,
  usdtBep20Attempt: true,
  binanceInternalPaymentAttempt: true,
  jagoTransferAttempt: true,
  items: { include: { product: true, stockItem: true } },
  deliveryReceipts: { orderBy: { createdAt: "desc" } },
  notifications: {
    where: { kind: { in: ["DELIVERY_ACKNOWLEDGED", "DELIVERY_MISSING_REPORT"] } },
    select: { kind: true, status: true },
  },
} satisfies Prisma.OrderInclude;

export type AdminOrderDetailQuery = {
  notice?: string;
  error?: string;
  remaining?: string;
  stockPage?: string;
  notifyPage?: string;
  notifyStatus?: string;
  reveal?: string;
};

export type AdminOrderDetailOrder = Prisma.OrderGetPayload<{
  include: typeof orderDetailInclude;
}>;

export type AdminOrderDetailView = NonNullable<
  Awaited<ReturnType<typeof getAdminOrderDetailView>>
>;

export async function getAdminOrderDetailView(
  id: string,
  query: AdminOrderDetailQuery,
) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: orderDetailInclude,
  });
  if (!order) return null;

  const requireHealthy = booleanEnv("STOCK_REQUIRE_HEALTHY", true);
  const canAssignOrder =
    order.isPreorder &&
    order.status === "PAID_WAITING_STOCK" &&
    order.paymentStatus === "PAID" &&
    order.items.some((item) => !item.stockItemId);
  const canCancelPreorder =
    canAssignOrder &&
    order.payment?.status === "PAID" &&
    order.items.every((item) => !item.stockItemId);
  const assignedUnits = order.items.filter((item) => item.stockItemId).length;
  const remainingUnits = order.items.length - assignedUnits;
  const nextUnassignedItem = order.items.find((item) => !item.stockItemId);
  const availableStockWhere: Prisma.DigitalStockItemWhereInput | null = nextUnassignedItem
    ? {
        productId: nextUnassignedItem.productId,
        archivedAt: null,
        status: "AVAILABLE",
        ...sellableStockWhere(requireHealthy),
      }
    : null;
  const notificationStatus = normalizeNotificationFilterStatus(query.notifyStatus);
  const notificationWhere: Prisma.TelegramNotificationWhereInput = {
    orderId: order.id,
    ...(notificationStatus ? { status: notificationStatus } : {}),
  };

  const [wallet, availableStockCount, notificationCount] = await Promise.all([
    prisma.wallet.findUnique({ where: { chatId: order.chatId } }),
    canAssignOrder && availableStockWhere
      ? prisma.digitalStockItem.count({ where: availableStockWhere })
      : Promise.resolve(0),
    prisma.telegramNotification.count({ where: notificationWhere }),
  ]);
  const stockPagination = adminPagination(
    availableStockCount,
    parseAdminPage(query.stockPage),
    8,
  );
  const notificationPagination = adminPagination(
    notificationCount,
    parseAdminPage(query.notifyPage),
    10,
  );
  const [stockItems, notifications] = await Promise.all([
    canAssignOrder && availableStockWhere
      ? prisma.digitalStockItem.findMany({
          where: availableStockWhere,
          orderBy: [{ lastCheckedAt: "desc" }, { createdAt: "asc" }],
          skip: stockPagination.skip,
          take: stockPagination.take,
        })
      : Promise.resolve([]),
    prisma.telegramNotification.findMany({
      where: notificationWhere,
      orderBy: { createdAt: "desc" },
      skip: notificationPagination.skip,
      take: notificationPagination.take,
    }),
  ]);

  const deliveryReceiptByStockId = new Map(
    order.deliveryReceipts.map((receipt) => [receipt.stockItemId, receipt]),
  );
  const deliverySummary = order.items.reduce(
    (summary, item) => {
      const receipt = item.stockItemId
        ? deliveryReceiptByStockId.get(item.stockItemId)
        : undefined;
      if (!receipt) summary.waiting += 1;
      else if (receipt.status === "SENT") summary.sent += 1;
      else if (receipt.status === "SENDING") summary.processing += 1;
      else summary.attention += 1;
      return summary;
    },
    { sent: 0, processing: 0, attention: 0, waiting: 0 },
  );

  return {
    order: await withAdminWebBuyer(order),
    wallet,
    canAssignOrder,
    canCancelPreorder,
    assignedUnits,
    remainingUnits,
    nextUnassignedItem,
    availableStockCount,
    notificationStatus,
    stockPagination,
    notificationPagination,
    stockItems,
    notifications,
    buyerDeliveryFeedback: deliveryFeedbackState(order.notifications),
    deliverySummary,
  };
}
