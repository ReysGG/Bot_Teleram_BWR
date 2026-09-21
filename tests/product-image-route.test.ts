import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProduct: vi.fn(),
  requireAdminRequest: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: { product: { findUnique: mocks.findProduct } },
}));
vi.mock("@/server/security/admin-auth", () => ({
  requireAdminRequest: mocks.requireAdminRequest,
}));

import { GET } from "@/app/api/admin/products/[id]/image/route";

function requestProductImage() {
  return GET(
    new NextRequest("https://store.example/api/admin/products/product-1/image"),
    { params: Promise.resolve({ id: "product-1" }) },
  );
}

describe("admin product image endpoint", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requires an authenticated admin session", async () => {
    mocks.requireAdminRequest.mockImplementationOnce(() => {
      throw new Error("UNAUTHORIZED");
    });

    const response = await requestProductImage();

    expect(response.status).toBe(401);
    expect(mocks.findProduct).not.toHaveBeenCalled();
  });

  it("serves a stored validated image without cache or MIME sniffing", async () => {
    const content = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mocks.findProduct.mockResolvedValue({
      imageUrl: `data:image/png;base64,${content.toString("base64")}`,
    });

    const response = await requestProductImage();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(content);
  });

  it("redirects only an HTTP(S) external image", async () => {
    mocks.findProduct.mockResolvedValue({
      imageUrl: "https://cdn.example.test/product.webp",
    });

    const response = await requestProductImage();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://cdn.example.test/product.webp",
    );
  });

  it("fails closed for missing and unsupported image values", async () => {
    mocks.findProduct.mockResolvedValueOnce({ imageUrl: null });
    await expect(requestProductImage()).resolves.toMatchObject({ status: 204 });

    mocks.findProduct.mockResolvedValueOnce({ imageUrl: "javascript:alert(1)" });
    await expect(requestProductImage()).resolves.toMatchObject({ status: 422 });
  });
});
