import { describe, expect, it, vi } from "vitest";
import {
  ProductImageError,
  decodeStoredProductImage,
  isStoredProductImage,
  prepareProductImage,
  removedProductImage,
  telegramCatalogImageUrl,
  telegramProductImageUrl,
} from "@/server/products/media";
import {
  productStatusNotice,
  resolveProductAdminReturnTo,
} from "@/server/products/admin-navigation";

describe("admin product media", () => {
  it("stores a validated PNG upload as a persistent data URL", async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    const prepared = await prepareProductImage(
      new File([png], "product.png", { type: "image/png" }),
    );

    expect(prepared?.imageUrl).toBe(
      `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
    );
    expect(isStoredProductImage(prepared?.imageUrl)).toBe(true);
    expect(removedProductImage()).toEqual({ imageUrl: null });
  });

  it("rejects image MIME spoofing", async () => {
    await expect(
      prepareProductImage(
        new File(["not a png"], "product.png", { type: "image/png" }),
      ),
    ).rejects.toBeInstanceOf(ProductImageError);
  });

  it("decodes stored media only when its Base64 bytes match the declared MIME", () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    const decoded = decodeStoredProductImage(
      `data:image/png;base64,${png.toString("base64")}`,
    );
    expect(decoded?.contentType).toBe("image/png");
    expect(decoded?.content).toEqual(png);
    decoded?.content.fill(0);

    expect(
      decodeStoredProductImage(
        `data:image/jpeg;base64,${png.toString("base64")}`,
      ),
    ).toBeNull();
  });

  it("builds versioned public Telegram URLs and rejects credential-bearing URLs", () => {
    vi.stubEnv("APP_URL", "https://store.example");
    const stored = "data:image/png;base64,iVBORw0KGgo=";
    expect(telegramCatalogImageUrl({
      kind: "product",
      id: "product 1",
      imageUrl: stored,
    })).toMatch(
      /^https:\/\/store\.example\/api\/catalog\/products\/product%201\/image\?v=[a-f0-9]{16}$/,
    );
    expect(telegramCatalogImageUrl({
      kind: "group",
      id: "group-1",
      imageUrl: "https://cdn.example/image.jpg",
    })).toBe("https://cdn.example/image.jpg");
    expect(telegramCatalogImageUrl({
      kind: "product",
      id: "product-1",
      imageUrl: "https://user:secret@cdn.example/image.jpg",
    })).toBeNull();
    vi.unstubAllEnvs();
  });

  it("prefers a variant image and otherwise inherits the parent group image", () => {
    vi.stubEnv("APP_URL", "https://store.example");
    const productImage = "data:image/png;base64,iVBORw0KGgo=";
    const groupImage = "data:image/png;base64,iVBORw0KGgoAAA=";

    expect(telegramProductImageUrl({
      productId: "variant-1",
      productImageUrl: productImage,
      group: { id: "group-1", imageUrl: groupImage },
    })).toMatch(/\/api\/catalog\/products\/variant-1\/image\?v=/);
    expect(telegramProductImageUrl({
      productId: "variant-1",
      productImageUrl: null,
      group: { id: "group-1", imageUrl: groupImage },
    })).toMatch(/\/api\/catalog\/product-groups\/group-1\/image\?v=/);
    expect(telegramProductImageUrl({
      productId: "variant-1",
      productImageUrl: "https://user:secret@cdn.example/image.jpg",
      group: { id: "group-1", imageUrl: groupImage },
    })).toMatch(/\/api\/catalog\/product-groups\/group-1\/image\?v=/);
    expect(telegramProductImageUrl({
      productId: "variant-1",
      productImageUrl: null,
      group: { id: "group-1", imageUrl: null },
    })).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe("admin product status navigation", () => {
  it("allows only dedicated product admin destinations", () => {
    expect(resolveProductAdminReturnTo(
      "/admin/products/inactive?q=k12&page=3&evil=1#product-list",
      "p1",
    )).toBe(
      "/admin/products/inactive?q=k12&page=3#product-list",
    );
    expect(resolveProductAdminReturnTo("https://example.com", "p1")).toBe(
      "/admin/products",
    );
    expect(productStatusNotice("ACTIVE")).toBe("product-activated");
    expect(productStatusNotice("INACTIVE")).toBe("product-deactivated");
  });
});
