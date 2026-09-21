import { walletTopupSearchWhere } from "@/server/admin/catalog-search";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { normalizeAdminSearch, orderSearchWhere } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import {
  normalizeWalletTopupFilter,
  walletTopupFilterWhere,
} from "@/server/admin/wallet-topups";
import { prisma } from "@/server/db/prisma";
import { getMaintenanceState } from "@/server/store/maintenance";
import { adminWebCustomerSelect, withAdminWebBuyer } from "@/server/admin/web-buyer";

export type AdminDashboardSearchParams = {
  notice?: string;
  error?: string;
  page?: string;
  topupPage?: string;
  topupQ?: string;
  topupStatus?: string;
  q?: string;
  sheet?: string;
};

export async function getAdminDashboardData(query: AdminDashboardSearchParams) {
  const search = normalizeAdminSearch(query.q);
  const topupSearch = normalizeAdminSearch(query.topupQ);
  const topupFilter = normalizeWalletTopupFilter(query.topupStatus);
  const activeSheet: "topups" | "orders" = query.sheet === "topups" ? "topups" : "orders";
  const now = new Date();
  const orderWhere = orderSearchWhere(search);
  const topupWhere = {
    AND: [
      walletTopupSearchWhere(topupSearch),
      walletTopupFilterWhere(topupFilter, now),
    ],
  };

  const [
    counts,
    productCount,
    orderTotal,
    manualReviewCount,
    failedNotificationCount,
    failedDeliveryCount,
    unknownDeliveryCount,
    walletTopupTotal,
    walletTopupAttentionCount,
    bridgeStatus,
    maintenance,
  ] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.product.count(),
    prisma.order.count({ where: orderWhere }),
    prisma.telegramNotification.count({ where: { status: "MANUAL_REVIEW" } }),
    prisma.telegramNotification.count({ where: { status: "FAILED" } }),
    prisma.sentDelivery.count({ where: { status: "FAILED" } }),
    prisma.sentDelivery.count({ where: { status: "UNKNOWN" } }),
    prisma.walletTopup.count({ where: topupWhere }),
    prisma.walletTopup.count({ where: walletTopupFilterWhere("problem", now) }),
    prisma.bridgeDeviceStatus.findFirst({ orderBy: { lastSeenAt: "desc" } }),
    getMaintenanceState(),
  ]);

  const orderPagination = adminPagination(
    orderTotal,
    parseAdminPage(query.page),
    10,
  );
  const walletTopupPagination = adminPagination(
    walletTopupTotal,
    parseAdminPage(query.topupPage),
    10,
  );
  const [orders, walletTopups] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      orderBy: { createdAt: "desc" },
      skip: orderPagination.skip,
      take: orderPagination.take,
      include: { payment: true, webCustomer: adminWebCustomerSelect },
    }),
    prisma.walletTopup.findMany({
      where: topupWhere,
      orderBy: { createdAt: "desc" },
      skip: walletTopupPagination.skip,
      take: walletTopupPagination.take,
      include: {
        wallet: true,
        bridgeClaim: true,
        qrisInvoiceAttempt: {
          select: { providerKeySnapshot: true },
        },
        bridgeEvents: {
          orderBy: { receivedAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  const bridgeAgeMs = bridgeStatus
    ? Math.max(0, now.getTime() - bridgeStatus.lastSeenAt.getTime())
    : Number.POSITIVE_INFINITY;

  return {
    activeSheet,
    bridgeAgeMinutes: Number.isFinite(bridgeAgeMs)
      ? Math.max(0, Math.floor(bridgeAgeMs / 60_000))
      : null,
    bridgeStale: bridgeAgeMs > 15 * 60_000,
    bridgeStatus,
    counts,
    failedDeliveryCount,
    failedNotificationCount,
    maintenance,
    manualReviewCount,
    now,
    orders: await Promise.all(orders.map(withAdminWebBuyer)),
    orderPagination,
    productCount,
    query,
    search,
    topupFilter,
    topupSearch,
    unknownDeliveryCount,
    walletTopups,
    walletTopupAttentionCount,
    walletTopupPagination,
  };
}

export type AdminDashboardData = Awaited<ReturnType<typeof getAdminDashboardData>>;
