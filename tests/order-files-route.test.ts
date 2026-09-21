import { inflateRawSync } from "node:zlib";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decryptedBuffers: [] as Buffer[],
  decryptStockFile: vi.fn(
    (item: { encryptedPayload: string }) => {
      const content = Buffer.from(item.encryptedPayload);
      mocks.decryptedBuffers.push(content);
      return content;
    },
  ),
  findOrder: vi.fn(),
  requireAdminRequest: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: { order: { findUnique: mocks.findOrder } },
}));
vi.mock("@/server/security/admin-auth", () => ({
  requireAdminRequest: mocks.requireAdminRequest,
}));
vi.mock("@/server/stock/inventory", () => ({
  decryptStockFile: mocks.decryptStockFile,
}));

import { GET } from "@/app/api/admin/orders/[id]/files/route";

function stockItem(input: {
  id: string;
  filename?: string;
  status?: string;
  deliveredOrderId?: string | null;
  receiptStatus?: string;
  receiptOrderId?: string;
  receiptStockItemId?: string;
}) {
  return {
    id: input.id,
    originalFilename: input.filename ?? `${input.id}.json`,
    encryptedPayload: `content:${input.id}`,
    encryptionIv: "iv",
    encryptionTag: "tag",
    status: input.status ?? "DELIVERED",
    deliveredOrderId: input.deliveredOrderId === undefined
      ? "order-1"
      : input.deliveredOrderId,
    deliveryReceipt: {
      orderId: input.receiptOrderId ?? "order-1",
      stockItemId: input.receiptStockItemId ?? input.id,
      status: input.receiptStatus ?? "SENT",
    },
  };
}

function extractLocalEntries(archive: Buffer) {
  const entries: Array<{ filename: string; content: Buffer }> = [];
  let offset = 0;

  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = archive.readUInt32LE(offset + 18);
    const filenameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const filenameStart = offset + 30;
    const contentStart = filenameStart + filenameLength + extraLength;
    const contentEnd = contentStart + compressedSize;
    entries.push({
      filename: archive.subarray(filenameStart, filenameStart + filenameLength).toString("utf8"),
      content: inflateRawSync(archive.subarray(contentStart, contentEnd)),
    });
    offset = contentEnd;
  }

  return entries;
}

async function requestOrderFiles(id = "order-1") {
  return GET(
    new NextRequest(`https://store.example/api/admin/orders/${id}/files`),
    { params: Promise.resolve({ id }) },
  );
}

describe("admin order bulk file download", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.decryptedBuffers.length = 0;
  });

  it("returns 401 before reading order metadata without an admin session", async () => {
    mocks.requireAdminRequest.mockImplementationOnce(() => {
      throw new Error("UNAUTHORIZED");
    });

    const response = await requestOrderFiles();

    expect(response.status).toBe(401);
    expect(mocks.findOrder).not.toHaveBeenCalled();
    expect(mocks.decryptStockFile).not.toHaveBeenCalled();
  });

  it("archives only files with an exact delivered order and SENT receipt match", async () => {
    mocks.findOrder.mockResolvedValue({
      invoiceNumber: "TGS-TEST-001",
      items: [
        { stockItem: stockItem({ id: "safe-1", filename: "account.json" }) },
        { stockItem: stockItem({ id: "safe-2", filename: "account.json" }) },
        { stockItem: stockItem({ id: "reserved", status: "RESERVED" }) },
        { stockItem: stockItem({ id: "failed", receiptStatus: "FAILED" }) },
        {
          stockItem: stockItem({
            id: "wrong-order",
            receiptOrderId: "order-2",
          }),
        },
        {
          stockItem: stockItem({
            id: "wrong-stock",
            receiptStockItemId: "another-stock",
          }),
        },
        {
          stockItem: stockItem({
            id: "wrong-delivery-order",
            deliveredOrderId: "order-2",
          }),
        },
        { stockItem: null },
      ],
    });

    const response = await requestOrderFiles();
    const entries = extractLocalEntries(Buffer.from(await response.arrayBuffer()));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toContain(
      "TGS-TEST-001-produk.zip",
    );
    expect(entries).toEqual([
      { filename: "account.json", content: Buffer.from("content:safe-1") },
      { filename: "account-2.json", content: Buffer.from("content:safe-2") },
    ]);
    expect(mocks.decryptStockFile).toHaveBeenCalledTimes(2);
    expect(
      mocks.decryptedBuffers.every((content) => content.every((byte) => byte === 0)),
    ).toBe(true);
  });

  it("rejects an order with no safely downloadable delivered files", async () => {
    mocks.findOrder.mockResolvedValue({
      invoiceNumber: "TGS-TEST-002",
      items: [
        { stockItem: stockItem({ id: "pending", receiptStatus: "SENDING" }) },
        { stockItem: stockItem({ id: "available", status: "AVAILABLE" }) },
      ],
    });

    const response = await requestOrderFiles();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "delivered-files-unavailable",
    });
    expect(mocks.decryptStockFile).not.toHaveBeenCalled();
  });

  it("rejects the whole archive when any eligible file cannot be decrypted", async () => {
    mocks.findOrder.mockResolvedValue({
      invoiceNumber: "TGS-TEST-003",
      items: [
        { stockItem: stockItem({ id: "safe" }) },
        { stockItem: stockItem({ id: "unavailable" }) },
      ],
    });
    mocks.decryptStockFile
      .mockReturnValueOnce(Buffer.from("content:safe"))
      .mockImplementationOnce(() => {
        throw new Error("invalid encryption key");
      });

    const response = await requestOrderFiles();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "delivered-files-unavailable",
    });
  });

  it("returns 404 when the order does not exist", async () => {
    mocks.findOrder.mockResolvedValue(null);

    const response = await requestOrderFiles("missing-order");

    expect(response.status).toBe(404);
    expect(mocks.decryptStockFile).not.toHaveBeenCalled();
  });
});
