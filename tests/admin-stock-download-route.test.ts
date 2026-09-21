import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAdminOrigin: vi.fn(),
  count: vi.fn(),
  decryptedBuffers: [] as Buffer[],
  findMany: vi.fn(),
  findProduct: vi.fn(),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    digitalStockItem: {
      count: mocks.count,
      findMany: mocks.findMany,
    },
    product: { findUnique: mocks.findProduct },
  },
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: mocks.assertAdminOrigin,
  requireAdminRequest: mocks.requireAdminRequest,
}));

vi.mock("@/server/stock/inventory", () => ({
  decryptStockFile: vi.fn((item: { encryptedPayload: string }) => {
    const content = Buffer.from(item.encryptedPayload, "utf8");
    mocks.decryptedBuffers.push(content);
    return content;
  }),
}));

import { POST } from "@/app/api/admin/inventory/download/route";

function stock(id: string, filename: string, content: string) {
  return {
    id,
    originalFilename: filename,
    encryptedPayload: content,
    encryptionIv: "iv",
    encryptionTag: "tag",
  };
}

function downloadRequest(fields: Record<string, string | string[]>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      form.append(name, item);
    }
  }
  return new NextRequest("https://store.example/api/admin/inventory/download", {
    method: "POST",
    headers: { origin: "https://store.example" },
    body: form,
  });
}

describe("admin stock download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptedBuffers = [];
    mocks.requireAdminRequest.mockReturnValue({ email: "owner@example.test" });
  });

  afterEach(() => {
    mocks.decryptedBuffers = [];
  });

  it("requires an admin session before querying stock", async () => {
    mocks.requireAdminRequest.mockImplementationOnce(() => {
      throw new Error("UNAUTHORIZED");
    });

    const response = await POST(downloadRequest({ stockItemIds: "stock-1" }));

    expect(response.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("downloads selected stock with no-store headers and clears plaintext buffers", async () => {
    mocks.findMany.mockResolvedValueOnce([
      stock("stock-1", "account.json", "{\"id\":1}"),
      stock("stock-2", "account.json", "{\"id\":2}"),
    ]);

    const response = await POST(downloadRequest({
      returnTo: "/admin/inventory/available#inventory-ledger",
      stockItemIds: ["stock-2", "stock-1"],
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toContain("stok-terpilih-2-stok");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(22);
    expect(mocks.decryptedBuffers.every((buffer) => buffer.every((byte) => byte === 0)))
      .toBe(true);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["stock-2", "stock-1"] } },
    }));
  });

  it("downloads every lifecycle row for one product in bounded pages", async () => {
    mocks.findProduct.mockResolvedValueOnce({ name: "ChatGPT K12" });
    mocks.count.mockResolvedValueOnce(2);
    mocks.findMany.mockResolvedValueOnce([
      stock("stock-1", "available.txt", "AVAILABLE"),
      stock("stock-2", "sold.txt", "SOLD"),
    ]);

    const response = await POST(downloadRequest({
      productId: "product-1",
      returnTo: "/admin/products/product-1/stock#inventory-ledger",
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("ChatGPT_K12-2-stok");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { productId: "product-1" },
      take: 100,
    }));
  });

  it("rejects an oversized product export before loading encrypted rows", async () => {
    mocks.findProduct.mockResolvedValueOnce({ name: "Large warehouse" });
    mocks.count.mockResolvedValueOnce(5_001);

    const response = await POST(downloadRequest({
      productId: "product-1",
      returnTo: "/admin/products/product-1/stock#inventory-ledger",
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("error=stock-download-limit");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
