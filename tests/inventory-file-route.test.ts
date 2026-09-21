import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decrypted: null as Buffer | null,
  decryptStockFile: vi.fn(() => {
    const content = Buffer.from("sensitive-inventory-content");
    mocks.decrypted = content;
    return content;
  }),
  findStock: vi.fn(),
  requireAdminRequest: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: { digitalStockItem: { findUnique: mocks.findStock } },
}));
vi.mock("@/server/security/admin-auth", () => ({
  requireAdminRequest: mocks.requireAdminRequest,
}));
vi.mock("@/server/stock/inventory", () => ({
  decryptStockFile: mocks.decryptStockFile,
}));

import { GET } from "@/app/api/admin/inventory/[id]/file/route";

function requestInventoryFile() {
  return GET(
    new NextRequest("https://store.example/api/admin/inventory/stock-1/file"),
    { params: Promise.resolve({ id: "stock-1" }) },
  );
}

describe("admin inventory file download", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.decrypted = null;
  });

  it("returns 401 before reading stock metadata without an admin session", async () => {
    mocks.requireAdminRequest.mockImplementationOnce(() => {
      throw new Error("UNAUTHORIZED");
    });

    const response = await requestInventoryFile();

    expect(response.status).toBe(401);
    expect(mocks.findStock).not.toHaveBeenCalled();
    expect(mocks.decryptStockFile).not.toHaveBeenCalled();
  });

  it("serves the decrypted file with sensitive download headers", async () => {
    mocks.findStock.mockResolvedValue({
      originalFilename: "account.json",
      encryptedPayload: "encrypted",
      encryptionIv: "iv",
      encryptionTag: "tag",
    });

    const response = await requestInventoryFile();

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("sensitive-inventory-content");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(mocks.decrypted?.every((byte) => byte === 0)).toBe(true);
  });
});
