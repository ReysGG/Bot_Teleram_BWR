import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decrypted: null as Buffer | null,
  decryptStockFile: vi.fn(() => {
    const content = Buffer.from("sensitive-delivery-content");
    mocks.decrypted = content;
    return content;
  }),
  findDelivery: vi.fn(),
  requireAdminRequest: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: { sentDelivery: { findUnique: mocks.findDelivery } },
}));
vi.mock("@/server/security/admin-auth", () => ({
  requireAdminRequest: mocks.requireAdminRequest,
}));
vi.mock("@/server/stock/inventory", () => ({
  decryptStockFile: mocks.decryptStockFile,
}));

import { GET } from "@/app/api/admin/deliveries/[id]/file/route";

function deliveredReceipt(status = "SENT") {
  return {
    orderId: "order-1",
    stockItemId: "stock-1",
    status,
    stockItem: {
      id: "stock-1",
      originalFilename: "account.json",
      encryptedPayload: "encrypted",
      encryptionIv: "iv",
      encryptionTag: "tag",
      status: "DELIVERED",
      deliveredOrderId: "order-1",
    },
  };
}

async function requestDeliveryFile() {
  return GET(
    new NextRequest("https://store.example/api/admin/deliveries/delivery-1/file"),
    { params: Promise.resolve({ id: "delivery-1" }) },
  );
}

describe("admin delivered file download", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.decrypted = null;
  });

  it("returns 401 before reading delivery metadata without an admin session", async () => {
    mocks.requireAdminRequest.mockImplementationOnce(() => {
      throw new Error("UNAUTHORIZED");
    });

    const response = await requestDeliveryFile();

    expect(response.status).toBe(401);
    expect(mocks.findDelivery).not.toHaveBeenCalled();
    expect(mocks.decryptStockFile).not.toHaveBeenCalled();
  });

  it("returns only an exact SENT and DELIVERED receipt match", async () => {
    mocks.findDelivery.mockResolvedValue(deliveredReceipt());

    const response = await requestDeliveryFile();

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("sensitive-delivery-content");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(response.headers.get("x-robots-tag")).toContain("noarchive");
    expect(mocks.decrypted?.every((byte) => byte === 0)).toBe(true);
  });

  it("does not decrypt a failed delivery receipt", async () => {
    mocks.findDelivery.mockResolvedValue(deliveredReceipt("FAILED"));

    const response = await requestDeliveryFile();

    expect(response.status).toBe(409);
    expect(mocks.decryptStockFile).not.toHaveBeenCalled();
  });

  it("does not expose a file whose delivered order does not match", async () => {
    const receipt = deliveredReceipt();
    receipt.stockItem.deliveredOrderId = "order-2";
    mocks.findDelivery.mockResolvedValue(receipt);

    const response = await requestDeliveryFile();

    expect(response.status).toBe(409);
    expect(mocks.decryptStockFile).not.toHaveBeenCalled();
  });
});
