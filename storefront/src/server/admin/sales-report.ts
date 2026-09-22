import { prisma } from "@/server/db/prisma";

const REPORT_RANGES = new Set([7, 30, 90]);
const SALE_ORDER_STATUSES = ["PAID_WAITING_STOCK", "PAID", "FULFILLING", "COMPLETED"] as const;
const SMS_SALE_STATUSES = ["ACTIVE", "COMPLETED"] as const;
const REFUND_TYPES = [
  "PAYMENT_RELEASE_REFUND",
  "DELIVERY_REFUND",
  "STOCK_UNAVAILABLE_REFUND",
  "PREORDER_CANCEL_REFUND",
  "SMS_PURCHASE_REFUND",
] as const;

export function parseSalesReportRange(value?: string) {
  const parsed = Number.parseInt(value ?? "30", 10);
  return REPORT_RANGES.has(parsed) ? parsed : 30;
}

export function salesReportStartDate(days: number, now = new Date()) {
  const jakartaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = new Date(`${jakartaDate}T00:00:00+07:00`);
  start.setUTCDate(start.getUTCDate() - Math.max(0, days - 1));
  return start;
}

function jakartaDayKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function dailySales(days: number, start: Date, orders: Array<{ paidAt: Date | null; grandTotal: number }>) {
  const totals = new Map<string, { revenue: number; orders: number }>();
  for (const order of orders) {
    if (!order.paidAt) continue;
    const key = jakartaDayKey(order.paidAt);
    const current = totals.get(key) ?? { revenue: 0, orders: 0 };
    current.revenue += order.grandTotal;
    current.orders += 1;
    totals.set(key, current);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    const key = jakartaDayKey(date);
    return { date, key, ...(totals.get(key) ?? { revenue: 0, orders: 0 }) };
  });
}

export async function getSalesReport(days: number) {
  const start = salesReportStartDate(days);
  const saleOrderWhere = {
    paymentStatus: "PAID" as const,
    status: { in: [...SALE_ORDER_STATUSES] },
    paidAt: { gte: start },
  };
  const [
    orderAggregate,
    paidOrders,
    productGroups,
    smsAggregate,
    smsCostAggregate,
    topupAggregate,
    refundAggregate,
    orderStatuses,
    smsStatuses,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: saleOrderWhere,
      _count: { _all: true },
      _sum: { grandTotal: true },
    }),
    prisma.order.findMany({
      where: saleOrderWhere,
      select: { paidAt: true, grandTotal: true },
      orderBy: { paidAt: "asc" },
    }),
    prisma.orderItem.groupBy({
      by: [
        "productGroupNameSnapshot",
        "variantLabelSnapshot",
        "productNameSnapshot",
        "unitPrice",
      ],
      where: { order: saleOrderWhere },
      _sum: { quantity: true },
    }),
    prisma.smsPoolCustomerOrder.aggregate({
      where: { status: { in: [...SMS_SALE_STATUSES] }, createdAt: { gte: start } },
      _count: { _all: true },
      _sum: { sellPrice: true },
    }),
    prisma.smsPoolCustomerOrder.aggregate({
      where: { status: { in: [...SMS_SALE_STATUSES] }, createdAt: { gte: start } },
      _sum: { providerCostUsdCents: true },
    }),
    prisma.walletTopup.aggregate({
      where: { status: "PAID", verifiedAt: { gte: start } },
      _count: { _all: true },
      _sum: { billedAmount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { type: { in: [...REFUND_TYPES] }, createdAt: { gte: start } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { createdAt: { gte: start } },
      _count: { _all: true },
    }),
    prisma.smsPoolCustomerOrder.groupBy({
      by: ["status"],
      where: { createdAt: { gte: start } },
      _count: { _all: true },
    }),
  ]);

  const productMap = new Map<string, { name: string; units: number; revenue: number }>();
  for (const group of productGroups) {
    const units = group._sum.quantity ?? 0;
    const productKey = [
      group.productGroupNameSnapshot ?? "",
      group.productNameSnapshot,
      group.variantLabelSnapshot ?? "",
    ].join("\u0000");
    const variantName = group.variantLabelSnapshot ?? group.productNameSnapshot;
    const displayName = group.productGroupNameSnapshot
      ? `${group.productGroupNameSnapshot} > ${variantName}`
      : group.productNameSnapshot;
    const current = productMap.get(productKey) ?? {
      name: displayName,
      units: 0,
      revenue: 0,
    };
    current.units += units;
    current.revenue += units * group.unitPrice;
    productMap.set(productKey, current);
  }

  const productRevenue = orderAggregate._sum.grandTotal ?? 0;
  const productOrders = orderAggregate._count._all;
  const smsRevenue = smsAggregate._sum.sellPrice ?? 0;
  return {
    days,
    start,
    productRevenue,
    productOrders,
    averageOrderValue: productOrders > 0 ? Math.round(productRevenue / productOrders) : 0,
    productUnits: [...productMap.values()].reduce((total, product) => total + product.units, 0),
    smsRevenue,
    smsOrders: smsAggregate._count._all,
    smsProviderCostUsdCents: smsCostAggregate._sum.providerCostUsdCents ?? 0,
    grossSales: productRevenue + smsRevenue,
    paidTopups: topupAggregate._sum.billedAmount ?? 0,
    paidTopupCount: topupAggregate._count._all,
    refunds: refundAggregate._sum.amount ?? 0,
    refundCount: refundAggregate._count._all,
    daily: dailySales(days, start, paidOrders),
    topProducts: [...productMap.values()]
      .sort((left, right) => right.revenue - left.revenue || right.units - left.units)
      .slice(0, 10),
    orderStatuses: orderStatuses
      .map((item) => ({ status: item.status, count: item._count._all }))
      .sort((left, right) => right.count - left.count),
    smsStatuses: smsStatuses
      .map((item) => ({ status: item.status, count: item._count._all }))
      .sort((left, right) => right.count - left.count),
  };
}
