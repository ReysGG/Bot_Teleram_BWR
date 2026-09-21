import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_FORM_RESPONSE_HEADER,
  ADMIN_FORM_RESPONSE_JSON,
} from "@/lib/admin-form-response";

const mocks = vi.hoisted(() => ({
  allocatePaidPreorders: vi.fn(),
  checkStockItems: vi.fn(),
  count: vi.fn(),
  enqueueProductRestock: vi.fn(),
  expandStockFiles: vi.fn(),
  importStockFiles: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: vi.fn(),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
}));

vi.mock("@/server/stock/inventory", () => {
  class StockImportError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    StockImportError,
    expandStockFiles: mocks.expandStockFiles,
    importStockFiles: mocks.importStockFiles,
  };
});

vi.mock("@/server/stock/health-check", () => ({
  checkStockItems: mocks.checkStockItems,
}));

vi.mock("@/server/preorder/allocate-stock", () => ({
  allocatePaidPreorders: mocks.allocatePaidPreorders,
}));

vi.mock("@/server/telegram/product-broadcast", () => ({
  enqueueProductRestock: mocks.enqueueProductRestock,
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: { digitalStockItem: { count: mocks.count } },
}));

vi.mock("@/server/stock/sellable", () => ({
  sellableStockWhere: vi.fn(() => ({})),
}));

import { POST } from "@/app/api/admin/inventory/route";

function uploadRequest(enhanced = false) {
  const form = new FormData();
  form.set("productId", "product-1");
  form.set("returnTo", "/admin/products/product-1/edit");
  form.append("files", new File(["credential"], "stock.txt", { type: "text/plain" }));
  return new NextRequest("https://store.example/api/admin/inventory", {
    method: "POST",
    headers: {
      origin: "https://store.example",
      ...(enhanced
        ? { [ADMIN_FORM_RESPONSE_HEADER]: ADMIN_FORM_RESPONSE_JSON }
        : {}),
    },
    body: form,
  });
}

function pastedUploadRequest(
  stockLines: string,
  includeFile = false,
  includeEmptyFilePlaceholder = false,
) {
  const form = new FormData();
  form.set("productId", "product-1");
  form.set("returnTo", "/admin/products/product-1/stock");
  form.set("stockLines", stockLines);
  if (includeFile) {
    form.append("files", new File(["FILE-CREDENTIAL"], "stock.txt", { type: "text/plain" }));
  }
  if (includeEmptyFilePlaceholder) {
    form.append("files", new File([], "", { type: "application/octet-stream" }));
  }
  return new NextRequest("https://store.example/api/admin/inventory", {
    method: "POST",
    headers: {
      origin: "https://store.example",
      [ADMIN_FORM_RESPONSE_HEADER]: ADMIN_FORM_RESPONSE_JSON,
    },
    body: form,
  });
}

describe("admin inventory upload response contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.expandStockFiles.mockReturnValue([{
      filename: "stock.txt",
      content: Buffer.from("credential"),
    }]);
    mocks.importStockFiles.mockResolvedValue([{ id: "stock-1" }]);
    mocks.checkStockItems.mockResolvedValue({ healthy: 1, banned: 0, errors: 0 });
    mocks.allocatePaidPreorders.mockResolvedValue(0);
    mocks.count.mockResolvedValue(1);
    mocks.enqueueProductRestock.mockResolvedValue(undefined);
  });

  it("keeps the native 303 redirect fallback", async () => {
    const response = await POST(uploadRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(
      "https://store.example/admin/products/product-1/edit?notice=stock-uploaded",
    );
  });

  it("returns JSON success to the enhanced stock form", async () => {
    const response = await POST(uploadRequest(true));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual(expect.objectContaining({ ok: true }));
    expect(payload.redirectTo).toContain(
      "/admin/products/product-1/edit?notice=stock-uploaded",
    );
  });

  it("returns a stable JSON validation error without navigating", async () => {
    const { StockImportError } = await import("@/server/stock/inventory");
    mocks.importStockFiles.mockRejectedValueOnce(new StockImportError(
      "stock-duplicate",
      "Duplicate stock",
    ));

    const response = await POST(uploadRequest(true));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "stock-duplicate",
    });
  });

  it("normalizes textarea-only stock into the existing TXT import pipeline", async () => {
    mocks.importStockFiles.mockImplementationOnce(async (input) => {
      expect(input.productId).toBe("product-1");
      expect(input.files).toHaveLength(1);
      expect(input.files[0].filename).toBe("pasted-stock.txt");
      expect(input.files[0].content.toString("utf8")).toBe("TOKEN-ONE\nTOKEN-TWO");
      return [{ id: "stock-1" }, { id: "stock-2" }];
    });
    mocks.count.mockResolvedValueOnce(2);

    const response = await POST(pastedUploadRequest(" TOKEN-ONE\r\n\r\nTOKEN-TWO "));

    expect(response.status).toBe(200);
    expect(mocks.checkStockItems).toHaveBeenCalledWith(["stock-1", "stock-2"]);
  });

  it("ignores the browser empty-file placeholder during textarea-only upload", async () => {
    mocks.importStockFiles.mockImplementationOnce(async (input) => {
      expect(input.files).toHaveLength(1);
      expect(input.files[0].filename).toBe("pasted-stock.txt");
      expect(input.files[0].content.toString("utf8")).toBe("TOKEN-ONE");
      return [{ id: "stock-1" }];
    });

    const response = await POST(pastedUploadRequest("TOKEN-ONE", false, true));

    expect(response.status).toBe(200);
    expect(mocks.importStockFiles).toHaveBeenCalledTimes(1);
  });

  it("combines uploaded files and pasted lines in one import operation", async () => {
    mocks.importStockFiles.mockImplementationOnce(async (input) => {
      expect(input.files).toHaveLength(2);
      expect(input.files.map((file: { filename: string }) => file.filename)).toEqual([
        "stock.txt",
        "pasted-stock.txt",
      ]);
      expect(input.files[1].content.toString("utf8")).toBe("TOKEN-TWO");
      return [{ id: "stock-1" }, { id: "stock-2" }];
    });

    const response = await POST(pastedUploadRequest("TOKEN-TWO", true));

    expect(response.status).toBe(200);
    expect(mocks.importStockFiles).toHaveBeenCalledTimes(1);
  });

  it("rejects more than 5,000 pasted stock lines before importing", async () => {
    const lines = Array.from({ length: 5_001 }, (_, index) => `TOKEN-${index}`).join("\n");

    const response = await POST(pastedUploadRequest(lines));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "stock-file-count",
    });
    expect(mocks.expandStockFiles).not.toHaveBeenCalled();
    expect(mocks.importStockFiles).not.toHaveBeenCalled();
  });
});
