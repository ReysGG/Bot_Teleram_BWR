import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  productCreate: vi.fn(),
  productUpdate: vi.fn(),
  productGroupCreate: vi.fn(),
  productGroupUpdate: vi.fn(),
  productGroupFindUnique: vi.fn(),
  fanout: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: vi.fn(),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      product: {
        create: mocks.productCreate,
        update: mocks.productUpdate,
      },
      productGroup: {
        findUnique: mocks.productGroupFindUnique,
      },
    })),
    productGroup: {
      create: mocks.productGroupCreate,
      update: mocks.productGroupUpdate,
    },
  },
}));

vi.mock("@/server/telegram/broadcast-fanout", () => ({
  fanoutBroadcastNotifications: mocks.fanout,
}));

import { POST as createProduct } from "@/app/api/admin/products/route";
import { POST as updateProduct } from "@/app/api/admin/products/[id]/route";
import { POST as createProductGroup } from "@/app/api/admin/product-groups/route";
import { POST as updateProductGroup } from "@/app/api/admin/product-groups/[id]/route";
import {
  ADMIN_FORM_RESPONSE_HEADER,
  ADMIN_FORM_RESPONSE_JSON,
} from "@/lib/admin-form-response";

function formRequest(
  path: string,
  input: Record<string, string>,
  enhanced = false,
) {
  return new NextRequest(`https://store.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://store.example",
      ...(enhanced
        ? { [ADMIN_FORM_RESPONSE_HEADER]: ADMIN_FORM_RESPONSE_JSON }
        : {}),
    },
    body: new URLSearchParams(input),
  });
}

const productInput = {
  name: "ChatGPT K12",
  description: "Buka katalog",
  descriptionEntities: JSON.stringify([
    { type: "bold", offset: 0, length: 4 },
  ]),
  descriptionEn: "Open catalog",
  descriptionEntitiesEn: JSON.stringify([
    { type: "italic", offset: 0, length: 4 },
  ]),
  price: "12000",
  imageUrl: "",
};

const groupInput = {
  name: "ChatGPT",
  description: "Semua varian ChatGPT",
  descriptionEntities: JSON.stringify([
    { type: "bold", offset: 13, length: 7 },
  ]),
  descriptionEn: "All ChatGPT variants",
  descriptionEntitiesEn: JSON.stringify([
    { type: "italic", offset: 4, length: 7 },
  ]),
  imageUrl: "",
  status: "ACTIVE",
  sortOrder: "10",
};

describe("catalog rich-description admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productCreate.mockResolvedValue({ id: "product-1" });
    mocks.productUpdate.mockResolvedValue({ id: "product-1" });
    mocks.productGroupCreate.mockResolvedValue({ id: "group-1" });
    mocks.productGroupUpdate.mockResolvedValue({ id: "group-1" });
    mocks.productGroupFindUnique.mockResolvedValue({ id: "group-1" });
    mocks.fanout.mockResolvedValue(0);
  });

  it("accepts validated entities when creating a product", async () => {
    const response = await createProduct(formRequest(
      "/api/admin/products",
      productInput,
    ));

    expect(mocks.productCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: "Buka katalog",
        descriptionEntities: [{ type: "bold", offset: 0, length: 4 }],
        descriptionEn: "Open catalog",
        descriptionEntitiesEn: [{ type: "italic", offset: 0, length: 4 }],
      }),
    });
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/products/product-1/edit?notice=product-created",
    );
  });

  it("returns a JSON success destination for enhanced product forms", async () => {
    const response = await createProduct(formRequest(
      "/api/admin/products",
      productInput,
      true,
    ));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      redirectTo: "/admin/products/product-1/edit?notice=product-created",
    });
  });

  it("does not let a stale edit form overwrite the dedicated product status", async () => {
    await updateProduct(formRequest(
      "/api/admin/products/product-1",
      { ...productInput, status: "ACTIVE" },
    ), { params: Promise.resolve({ id: "product-1" }) });

    expect(mocks.productUpdate).toHaveBeenCalledTimes(1);
    const call = mocks.productUpdate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).not.toHaveProperty("status");
  });

  it("uses a stable product-description error for unsafe create and edit input", async () => {
    const unsafe = {
      ...productInput,
      descriptionEntities: JSON.stringify([{
        type: "text_link",
        offset: 0,
        length: 4,
        url: "http://unsafe.example.test",
      }]),
    };
    const createResponse = await createProduct(formRequest(
      "/api/admin/products",
      unsafe,
    ));
    const updateResponse = await updateProduct(formRequest(
      "/api/admin/products/product-1",
      { ...unsafe, status: "ACTIVE" },
    ), { params: Promise.resolve({ id: "product-1" }) });

    expect(mocks.productCreate).not.toHaveBeenCalled();
    expect(mocks.productUpdate).not.toHaveBeenCalled();
    expect(createResponse.headers.get("location")).toBe(
      "https://store.example/admin/products?error=product-description",
    );
    expect(updateResponse.headers.get("location")).toBe(
      "https://store.example/admin/products/product-1/edit?error=product-description",
    );
  });

  it("rejects an unsafe English product description without touching the product", async () => {
    const response = await createProduct(formRequest(
      "/api/admin/products",
      {
        ...productInput,
        descriptionEntitiesEn: JSON.stringify([{
          type: "text_link",
          offset: 0,
          length: 4,
          url: "http://unsafe.example.test",
        }]),
      },
    ));

    expect(mocks.productCreate).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/products?error=product-description",
    );
  });

  it("returns JSON errors without redirecting enhanced forms", async () => {
    const unsafe = {
      ...productInput,
      descriptionEntities: JSON.stringify([{
        type: "text_link",
        offset: 0,
        length: 4,
        url: "http://unsafe.example.test",
      }]),
    };
    const createResponse = await createProduct(formRequest(
      "/api/admin/products",
      unsafe,
      true,
    ));
    const updateResponse = await updateProduct(formRequest(
      "/api/admin/products/product-1",
      { ...unsafe, status: "ACTIVE" },
      true,
    ), { params: Promise.resolve({ id: "product-1" }) });

    expect(createResponse.status).toBe(422);
    await expect(createResponse.json()).resolves.toEqual({
      ok: false,
      error: "product-description",
    });
    expect(updateResponse.status).toBe(422);
    await expect(updateResponse.json()).resolves.toEqual({
      ok: false,
      error: "product-description",
    });
  });

  it("keeps native variant failures on the originating group page", async () => {
    const response = await createProduct(formRequest(
      "/api/admin/products",
      {
        ...productInput,
        groupId: "group-1",
        variantLabel: "K12",
        returnTo: "/admin/product-groups/group-1/edit",
        descriptionEntities: "not-json",
      },
    ));

    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/product-groups/group-1/edit?error=product-description",
    );
  });

  it("accepts validated entities when creating a product group", async () => {
    const response = await createProductGroup(formRequest(
      "/api/admin/product-groups",
      groupInput,
    ));

    expect(mocks.productGroupCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: "Semua varian ChatGPT",
        descriptionEntities: [{ type: "bold", offset: 13, length: 7 }],
        descriptionEn: "All ChatGPT variants",
        descriptionEntitiesEn: [{ type: "italic", offset: 4, length: 7 }],
      }),
    });
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/product-groups?notice=group-created",
    );
  });

  it("returns enhanced group success and validation errors without losing the form destination", async () => {
    const success = await createProductGroup(formRequest(
      "/api/admin/product-groups",
      groupInput,
      true,
    ));
    expect(success.status).toBe(201);
    await expect(success.json()).resolves.toEqual({
      ok: true,
      redirectTo: "/admin/product-groups?notice=group-created",
    });

    const failure = await createProductGroup(formRequest(
      "/api/admin/product-groups",
      { ...groupInput, descriptionEn: "x" },
      true,
    ));
    expect(failure.status).toBe(422);
    await expect(failure.json()).resolves.toEqual({
      ok: false,
      error: "group-description",
    });
  });

  it("uses a stable group-description error for unsafe create and edit input", async () => {
    const unsafe = {
      ...groupInput,
      descriptionEntities: JSON.stringify([{
        type: "text_link",
        offset: 0,
        length: 5,
        url: "javascript:alert(1)",
      }]),
    };
    const createResponse = await createProductGroup(formRequest(
      "/api/admin/product-groups",
      unsafe,
    ));
    const updateResponse = await updateProductGroup(formRequest(
      "/api/admin/product-groups/group-1",
      unsafe,
    ), { params: Promise.resolve({ id: "group-1" }) });

    expect(mocks.productGroupCreate).not.toHaveBeenCalled();
    expect(mocks.productGroupUpdate).not.toHaveBeenCalled();
    expect(createResponse.headers.get("location")).toBe(
      "https://store.example/admin/product-groups/new?error=group-description",
    );
    expect(updateResponse.headers.get("location")).toBe(
      "https://store.example/admin/product-groups/group-1/edit?error=group-description",
    );
  });
});
