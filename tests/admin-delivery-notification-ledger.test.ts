import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  productFindMany: vi.fn(),
  sentCount: vi.fn(),
  sentFindMany: vi.fn(),
  notificationCount: vi.fn(),
  notificationFindMany: vi.fn(),
}));

vi.mock("@/server/admin/inventory", () => ({
  getAdminInventoryCounts: vi.fn().mockResolvedValue({
    available: 0,
    sold: 0,
    banned: 0,
    archived: 0,
    preorders: 0,
  }),
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    product: { findMany: mocks.productFindMany },
    sentDelivery: {
      count: mocks.sentCount,
      findMany: mocks.sentFindMany,
    },
    telegramNotification: {
      count: mocks.notificationCount,
      findMany: mocks.notificationFindMany,
    },
  },
}));

import { getAdminDeliveriesData } from "@/server/admin/deliveries";

describe("admin delivery notification diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productFindMany.mockResolvedValue([]);
    mocks.sentCount.mockResolvedValue(0);
    mocks.sentFindMany.mockImplementation(async (args) => (
      args?.distinct ? [] : []
    ));
    mocks.notificationCount.mockResolvedValue(1);
    mocks.notificationFindMany.mockImplementation(async (args) => (
      args?.distinct
        ? [{ kind: "PRODUCT_POST_DELIVERY" }]
        : [{
            id: "notification-1",
            kind: "PRODUCT_POST_DELIVERY",
            status: "MANUAL_REVIEW",
            attempts: 1,
            lastError: "Telegram accepted the guide but commit failed",
            createdAt: new Date("2026-08-31T10:00:00.000Z"),
            chatId: "123",
            orderId: "order-1",
            order: {
              invoiceNumber: "TGS-1",
              buyerUsername: "buyer",
              buyerDisplayName: null,
            },
          }]
    ));
  });

  it("queries failed/manual-review notifications without selecting private message content", async () => {
    const data = await getAdminDeliveriesData({
      notifyKind: "PRODUCT_POST_DELIVERY",
      notifyPage: "2",
      notifyQ: "@buyer",
      notifyStatus: "MANUAL_REVIEW",
    });

    expect(mocks.notificationCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        kind: "PRODUCT_POST_DELIVERY",
        status: "MANUAL_REVIEW",
      }),
    });
    const issueQuery = mocks.notificationFindMany.mock.calls.find(
      ([args]) => !args?.distinct,
    )?.[0];
    expect(issueQuery.select).not.toHaveProperty("messageText");
    expect(issueQuery.select).toMatchObject({
      id: true,
      kind: true,
      lastError: true,
      order: { select: { invoiceNumber: true } },
    });
    expect(data.notificationIssueKinds).toEqual(["PRODUCT_POST_DELIVERY"]);
    expect(data.notificationIssues).toHaveLength(1);
    expect(data.notificationPagination.totalItems).toBe(1);
  });
});
