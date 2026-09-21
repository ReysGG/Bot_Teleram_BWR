import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    product: { update: vi.fn().mockResolvedValue({}) },
    digitalStockItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return {
    allocatePaidPreorders: vi.fn().mockResolvedValue(2),
    assertAdminOrigin: vi.fn(),
    lockInventoryAllocation: vi.fn(),
    requireAdminRequest: vi.fn(),
    transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    tx,
  };
});

vi.mock("@/server/checkout/inventory-lock", () => ({
  lockInventoryAllocation: mocks.lockInventoryAllocation,
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));
vi.mock("@/server/preorder/allocate-stock", () => ({
  allocatePaidPreorders: mocks.allocatePaidPreorders,
}));
vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: mocks.assertAdminOrigin,
  requireAdminRequest: mocks.requireAdminRequest,
}));

import { POST } from "@/app/api/admin/products/[id]/banned-policy/route";

describe("admin product banned-stock policy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allocatePaidPreorders.mockResolvedValue(2);
    mocks.tx.product.update.mockResolvedValue({});
    mocks.tx.digitalStockItem.updateMany.mockResolvedValue({ count: 1 });
  });

  it("makes only existing unallocated HTTP 401 stock available", async () => {
    const form = new FormData();
    form.set("bannedStockPolicy", "ALLOW_HTTP_401");

    const response = await POST(
      new NextRequest("https://store.example/api/admin/products/product-1/banned-policy", {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ id: "product-1" }) },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/products/product-1/edit?notice=banned-policy-updated&allocated=2",
    );
    expect(mocks.tx.product.update).toHaveBeenCalledWith({
      where: { id: "product-1" },
      data: { bannedStockPolicy: "ALLOW_HTTP_401" },
    });
    expect(mocks.tx.digitalStockItem.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ status: "BANNED" }),
      }),
    );
    expect(mocks.tx.digitalStockItem.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ healthHttpStatus: 401 }),
        data: { status: "AVAILABLE" },
      }),
    );
    expect(mocks.allocatePaidPreorders).toHaveBeenCalledWith("product-1");
  });

  it("keeps HTTP 402 blocked when automatic HTTP 401 sale is enabled", async () => {
    const form = new FormData();
    form.set("bannedStockPolicy", "ALLOW_HTTP_401");

    await POST(
      new NextRequest("https://store.example/api/admin/products/product-2/banned-policy", {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ id: "product-2" }) },
    );

    const allowUpdate = mocks.tx.digitalStockItem.updateMany.mock.calls[1]?.[0];
    expect(allowUpdate.where).toMatchObject({
      healthStatus: "BANNED",
      healthHttpStatus: 401,
    });
    expect(allowUpdate.where.healthHttpStatus).not.toBe(402);
  });
});
