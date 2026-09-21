import { Prisma } from "@/generated/prisma/client";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import {
  activeDeliveryMissingReportWhere,
  combineDeliveryWhere,
  deliveryStatusWhere,
  normalizeDeliveryFilterStatus,
} from "@/server/admin/status-filter";
import { prisma } from "@/server/db/prisma";

export type AdminDeliveriesSearchParams = {
  page?: string;
  product?: string;
  q?: string;
  status?: string;
  notice?: string;
  error?: string;
  queued?: string;
  skipped?: string;
  notifyPage?: string;
  notifyQ?: string;
  notifyStatus?: string;
  notifyKind?: string;
};

function normalizeNotificationIssueStatus(value: string | undefined) {
  return value === "FAILED" || value === "MANUAL_REVIEW" ? value : "";
}

export async function getAdminDeliveriesData(query: AdminDeliveriesSearchParams) {
  const search = normalizeAdminSearch(query.q);
  const productId = query.product?.trim() || "";
  const status = normalizeDeliveryFilterStatus(query.status);
  const username = search.replace(/^@/, "");
  const notificationSearch = normalizeAdminSearch(query.notifyQ);
  const notificationUsername = notificationSearch.replace(/^@/, "");
  const notificationStatus = normalizeNotificationIssueStatus(query.notifyStatus);
  const notificationKind = query.notifyKind?.trim().slice(0, 100) || "";
  const baseWhere: Prisma.SentDeliveryWhereInput = {
    ...(productId ? { stockItem: { productId } } : {}),
    ...(search
      ? {
          OR: [
            { chatId: { contains: search } },
            { order: { buyerUsername: { contains: username, mode: "insensitive" } } },
            { order: { buyerDisplayName: { contains: search, mode: "insensitive" } } },
            { order: { invoiceNumber: { contains: search, mode: "insensitive" } } },
            { stockItem: { product: { name: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const buyerReportWhere = activeDeliveryMissingReportWhere();
  const where = combineDeliveryWhere(baseWhere, deliveryStatusWhere(status));
  const notificationIssueWhere: Prisma.TelegramNotificationWhereInput = {
    status: notificationStatus || { in: ["FAILED", "MANUAL_REVIEW"] },
    ...(notificationKind ? { kind: notificationKind } : {}),
    ...(notificationSearch
      ? {
          OR: [
            { chatId: { contains: notificationSearch } },
            { kind: { contains: notificationSearch, mode: "insensitive" } },
            { lastError: { contains: notificationSearch, mode: "insensitive" } },
            { order: { invoiceNumber: { contains: notificationSearch, mode: "insensitive" } } },
            { order: { buyerUsername: { contains: notificationUsername, mode: "insensitive" } } },
            { order: { buyerDisplayName: { contains: notificationSearch, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [
    counts,
    products,
    totalDeliveryCount,
    totalItems,
    sentCount,
    attentionCount,
    reportedOrders,
    reportedDeliveryRowCount,
    notificationIssueCount,
    notificationIssueKinds,
  ] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.product.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.sentDelivery.count(),
    prisma.sentDelivery.count({ where }),
    prisma.sentDelivery.count({ where: { ...baseWhere, status: "SENT" } }),
    prisma.sentDelivery.count({ where: { ...baseWhere, status: { in: ["FAILED", "UNKNOWN"] } } }),
    prisma.sentDelivery.findMany({
      where: combineDeliveryWhere(baseWhere, buyerReportWhere),
      distinct: ["orderId"],
      select: { orderId: true },
    }),
    prisma.sentDelivery.count({ where: combineDeliveryWhere(baseWhere, buyerReportWhere) }),
    prisma.telegramNotification.count({ where: notificationIssueWhere }),
    prisma.telegramNotification.findMany({
      where: { status: { in: ["FAILED", "MANUAL_REVIEW"] } },
      distinct: ["kind"],
      orderBy: { kind: "asc" },
      select: { kind: true },
    }),
  ]);
  const pagination = adminPagination(totalItems, parseAdminPage(query.page), 20);
  const notificationPagination = adminPagination(
    notificationIssueCount,
    parseAdminPage(query.notifyPage),
    20,
  );
  const [deliveries, notificationIssues] = await Promise.all([
    prisma.sentDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        order: {
          include: {
            notifications: {
              where: { kind: { in: ["DELIVERY_ACKNOWLEDGED", "DELIVERY_MISSING_REPORT"] } },
              select: { id: true, kind: true, status: true },
            },
          },
        },
        stockItem: { include: { product: true } },
      },
    }),
    prisma.telegramNotification.findMany({
      where: notificationIssueWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: notificationPagination.skip,
      take: notificationPagination.take,
      select: {
        id: true,
        kind: true,
        status: true,
        attempts: true,
        lastError: true,
        createdAt: true,
        chatId: true,
        orderId: true,
        order: {
          select: {
            invoiceNumber: true,
            buyerUsername: true,
            buyerDisplayName: true,
          },
        },
      },
    }),
  ]);

  return {
    attentionCount,
    counts,
    deliveries,
    notificationIssueKinds: notificationIssueKinds.map((item) => item.kind),
    notificationIssues,
    notificationKind,
    notificationPagination,
    notificationSearch,
    notificationStatus,
    pagination,
    productId,
    products,
    query,
    reportedDeliveryRowCount,
    reportedOrderCount: reportedOrders.length,
    search,
    sentCount,
    status,
    totalDeliveryCount,
    totalItems,
  };
}

export type AdminDeliveriesData = Awaited<ReturnType<typeof getAdminDeliveriesData>>;
