import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderCount: vi.fn().mockResolvedValue(5),
  stockCount: vi.fn().mockResolvedValue(1),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    digitalStockItem: { count: mocks.stockCount },
    order: { count: mocks.orderCount },
  },
}));

import { getAdminInventoryCounts } from "@/server/admin/inventory";

describe("admin inventory count coalescing", () => {
  it("shares simultaneous loads and briefly reuses navigation badge counts", async () => {
    const first = getAdminInventoryCounts();
    const second = getAdminInventoryCounts();

    expect(second).toBe(first);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { available: 1, sold: 1, banned: 1, archived: 1, preorders: 5 },
      { available: 1, sold: 1, banned: 1, archived: 1, preorders: 5 },
    ]);
    expect(mocks.stockCount).toHaveBeenCalledTimes(4);
    expect(mocks.orderCount).toHaveBeenCalledTimes(1);

    await expect(getAdminInventoryCounts()).resolves.toEqual({
      available: 1,
      sold: 1,
      banned: 1,
      archived: 1,
      preorders: 5,
    });
    expect(mocks.stockCount).toHaveBeenCalledTimes(4);
  });
});
