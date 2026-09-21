import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_FORM_RESPONSE_HEADER,
  ADMIN_FORM_RESPONSE_JSON,
} from "@/lib/admin-form-response";

const mocks = vi.hoisted(() => ({
  assertAdminOrigin: vi.fn(),
  lockInventoryAllocation: vi.fn(),
  permanentlyDeleteStockItems: vi.fn().mockResolvedValue({ deleted: 1 }),
  productUpdate: vi.fn().mockResolvedValue({}),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
  transaction: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: mocks.assertAdminOrigin,
  requireAdminRequest: mocks.requireAdminRequest,
}));

vi.mock("@/server/stock/admin-actions", () => ({
  permanentlyDeleteStockItems: mocks.permanentlyDeleteStockItems,
}));

vi.mock("@/server/checkout/inventory-lock", () => ({
  lockInventoryAllocation: mocks.lockInventoryAllocation,
}));

import { POST as deleteInventory } from "@/app/api/admin/inventory/delete/route";
import { POST as updateProductStatus } from "@/app/api/admin/products/[id]/status/route";

function request(path: string, body: URLSearchParams, enhanced = false) {
  return new NextRequest(`https://store.example${path}`, {
    method: "POST",
    headers: enhanced
      ? { [ADMIN_FORM_RESPONSE_HEADER]: ADMIN_FORM_RESPONSE_JSON }
      : undefined,
    body,
  });
}

describe("admin catalog and inventory mutation navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback) => callback({
      product: { update: mocks.productUpdate },
    }));
  });

  it("keeps the filtered inventory page and ledger anchor after bulk delete", async () => {
    const response = await deleteInventory(request(
      "/api/admin/inventory/delete",
      new URLSearchParams({
        returnTo: "/admin/inventory/banned?q=account&page=3&evil=drop#inventory-ledger",
        stockItemIds: "stock-1",
      }),
    ));

    expect(mocks.permanentlyDeleteStockItems).toHaveBeenCalledWith(["stock-1"]);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/inventory/banned?q=account&page=3&notice=deleted#inventory-ledger",
    );
  });

  it("keeps product list filters, pagination, and anchor after a status change", async () => {
    const response = await updateProductStatus(
      request(
        "/api/admin/products/product-1/status",
        new URLSearchParams({
          status: "INACTIVE",
          returnTo: "/admin/products?q=k12&group=chatgpt&page=2&evil=drop#product-list",
        }),
      ),
      { params: Promise.resolve({ id: "product-1" }) },
    );

    expect(mocks.productUpdate).toHaveBeenCalledWith({
      where: { id: "product-1" },
      data: { status: "INACTIVE" },
    });
    expect(mocks.lockInventoryAllocation).toHaveBeenCalledWith(
      expect.anything(),
      "product-1",
    );
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/products?q=k12&group=chatgpt&page=2&notice=product-deactivated#product-list",
    );
  });

  it("returns JSON success to the enhanced status action", async () => {
    const response = await updateProductStatus(
      request(
        "/api/admin/products/product-1/status",
        new URLSearchParams({
          status: "INACTIVE",
          returnTo: "/admin/products/inactive#product-list",
          failureReturnTo: "/admin/products?q=k12&page=2#product-list",
        }),
        true,
      ),
      { params: Promise.resolve({ id: "product-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      redirectTo: "/admin/products/inactive?notice=product-deactivated#product-list",
    });
  });

  it("keeps native failures on the originating list instead of the success destination", async () => {
    mocks.productUpdate.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await updateProductStatus(
      request(
        "/api/admin/products/product-1/status",
        new URLSearchParams({
          status: "INACTIVE",
          returnTo: "/admin/products/inactive#product-list",
          failureReturnTo: "/admin/products?q=k12&page=2#product-list",
        }),
      ),
      { params: Promise.resolve({ id: "product-1" }) },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/products?q=k12&page=2&error=product-status#product-list",
    );
  });

  it("returns a stable JSON failure without navigating the enhanced action", async () => {
    mocks.productUpdate.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await updateProductStatus(
      request(
        "/api/admin/products/product-1/status",
        new URLSearchParams({
          status: "INACTIVE",
          returnTo: "/admin/products/inactive#product-list",
          failureReturnTo: "/admin/products?q=k12&page=2#product-list",
        }),
        true,
      ),
      { params: Promise.resolve({ id: "product-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "product-status",
    });
  });
});
