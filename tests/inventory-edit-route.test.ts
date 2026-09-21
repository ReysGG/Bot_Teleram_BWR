import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  allocatePaidPreorders: vi.fn().mockResolvedValue(0),
  assertAdminOrigin: vi.fn(),
  checkStockItem: vi.fn().mockResolvedValue({ classification: "HEALTHY" }),
  requireAdminRequest: vi.fn(),
  updateStockItem: vi.fn().mockResolvedValue({
    id: "stock-1",
    productId: "product-1",
    archived: false,
  }),
}));

vi.mock("@/server/admin/inventory", () => ({
  isProductStockReturnPath: () => false,
  normalizeInventoryReturnUrl: (value: string, fallback: string) => value || fallback,
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
vi.mock("@/server/stock/health-check", () => ({
  checkStockItem: mocks.checkStockItem,
}));
vi.mock("@/server/stock/inventory", () => ({
  StockImportError: class StockImportError extends Error {},
  updateStockItem: mocks.updateStockItem,
}));

import { POST } from "@/app/api/admin/inventory/[id]/edit/route";

describe("admin inventory edit route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ignores legacy hidden plaintext and preserves binary content server-side", async () => {
    const form = new FormData();
    form.set("productId", "product-1");
    form.set("filename", "license.bin");
    form.set("returnTo", "/admin/inventory/available");
    form.set("storedBase64", Buffer.from("must-not-return-to-server").toString("base64"));

    const response = await POST(
      new NextRequest("https://store.example/api/admin/inventory/stock-1/edit", {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ id: "stock-1" }) },
    );

    expect(response.status).toBe(303);
    expect(mocks.updateStockItem).toHaveBeenCalledWith({
      stockItemId: "stock-1",
      productId: "product-1",
      filename: "license.bin",
      content: undefined,
    });
  });
});
