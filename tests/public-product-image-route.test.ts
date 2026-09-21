import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProduct: vi.fn(),
  findGroup: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    product: { findFirst: mocks.findProduct },
    productGroup: { findFirst: mocks.findGroup },
  },
}));

import { GET as getProductImage } from "@/app/api/catalog/products/[id]/image/route";
import { GET as getGroupImage } from "@/app/api/catalog/product-groups/[id]/image/route";

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

describe("public Telegram catalog image endpoints", () => {
  afterEach(() => vi.clearAllMocks());

  it("serves only an active public product image with safe public cache headers", async () => {
    mocks.findProduct.mockResolvedValue({
      imageUrl: `data:image/png;base64,${png.toString("base64")}`,
    });
    const response = await getProductImage(new Request("https://store.example"), {
      params: Promise.resolve({ id: "product-1" }),
    });

    expect(mocks.findProduct).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "product-1", status: "ACTIVE" }),
      select: { imageUrl: true },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("public");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
  });

  it("returns 404 instead of exposing an inactive or malformed image", async () => {
    mocks.findProduct.mockResolvedValueOnce(null);
    await expect(getProductImage(new Request("https://store.example"), {
      params: Promise.resolve({ id: "inactive" }),
    })).resolves.toMatchObject({ status: 404 });

    mocks.findGroup.mockResolvedValueOnce({ imageUrl: "javascript:alert(1)" });
    await expect(getGroupImage(new Request("https://store.example"), {
      params: Promise.resolve({ id: "group-1" }),
    })).resolves.toMatchObject({ status: 404 });
  });
});
