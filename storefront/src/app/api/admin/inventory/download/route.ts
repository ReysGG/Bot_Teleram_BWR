import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizeInventoryReturnUrl } from "@/server/admin/inventory";
import { adminResultReturnPath } from "@/server/admin/return-path";
import { prisma } from "@/server/db/prisma";
import { appRoute } from "@/server/env";
import { sensitiveDownloadHeaders } from "@/server/files/download";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import {
  createStockExportArchive,
  MAX_SELECTED_STOCK_EXPORT_ITEMS,
  MAX_STOCK_EXPORT_ITEMS,
  STOCK_EXPORT_PAGE_SIZE,
  StockExportError,
  type StockExportRecord,
} from "@/server/stock/export";
import { safeFilename } from "@/server/utils/format";

export const runtime = "nodejs";

const stockIdSchema = z.string().trim().min(1).max(191);

const stockExportSelect = {
  id: true,
  originalFilename: true,
  encryptedPayload: true,
  encryptionIv: true,
  encryptionTag: true,
} as const;

async function* selectedStockPages(ids: string[]): AsyncGenerator<StockExportRecord[]> {
  const records = await prisma.digitalStockItem.findMany({
    where: { id: { in: ids } },
    select: stockExportSelect,
  });
  if (records.length !== ids.length) {
    throw new StockExportError(
      "stock-download-missing",
      "One or more selected stock items no longer exist",
    );
  }
  const recordsById = new Map(records.map((record) => [record.id, record]));
  yield ids.map((id) => recordsById.get(id)!);
}

async function* productStockPages(productId: string): AsyncGenerator<StockExportRecord[]> {
  let cursor: string | undefined;
  while (true) {
    const page = await prisma.digitalStockItem.findMany({
      where: { productId },
      orderBy: { id: "asc" },
      take: STOCK_EXPORT_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: stockExportSelect,
    });
    if (page.length === 0) return;
    yield page;
    if (page.length < STOCK_EXPORT_PAGE_SIZE) return;
    cursor = page[page.length - 1].id;
  }
}

function stockExportFilename(label: string, count: number): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${safeFilename(label)}-${count}-stok-${date}.zip`;
}

export async function POST(request: NextRequest) {
  let returnTo = "/admin/inventory/available";
  let archive: Buffer | null = null;
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    returnTo = normalizeInventoryReturnUrl(String(form.get("returnTo") ?? ""), returnTo);
    const productId = String(form.get("productId") ?? "").trim();
    const requestedIds = form
      .getAll("stockItemIds")
      .map((value) => stockIdSchema.parse(String(value)));
    const stockItemIds = [...new Set(requestedIds)];

    let filename: string;
    if (productId) {
      if (stockItemIds.length > 0) {
        throw new StockExportError(
          "stock-download-limit",
          "Choose either selected stock or the whole product",
        );
      }
      const [product, count] = await Promise.all([
        prisma.product.findUnique({ where: { id: productId }, select: { name: true } }),
        prisma.digitalStockItem.count({ where: { productId } }),
      ]);
      if (!product) {
        throw new StockExportError("stock-download-missing", "Product not found");
      }
      if (count === 0) {
        throw new StockExportError("stock-download-empty", "Product has no stock");
      }
      if (count > MAX_STOCK_EXPORT_ITEMS) {
        throw new StockExportError(
          "stock-download-limit",
          `Product export exceeds ${MAX_STOCK_EXPORT_ITEMS} items`,
        );
      }
      archive = await createStockExportArchive(productStockPages(productId));
      filename = stockExportFilename(product.name, count);
    } else {
      if (stockItemIds.length === 0) {
        throw new StockExportError(
          "stock-download-empty",
          "Select at least one stock item",
        );
      }
      if (stockItemIds.length > MAX_SELECTED_STOCK_EXPORT_ITEMS) {
        throw new StockExportError(
          "stock-download-limit",
          `Selected export exceeds ${MAX_SELECTED_STOCK_EXPORT_ITEMS} items`,
        );
      }
      const parsedIds = z.array(stockIdSchema).parse(stockItemIds);
      archive = await createStockExportArchive(selectedStockPages(parsedIds), {
        maxItems: MAX_SELECTED_STOCK_EXPORT_ITEMS,
      });
      filename = stockExportFilename("stok-terpilih", parsedIds.length);
    }

    return new NextResponse(Uint8Array.from(archive), {
      headers: sensitiveDownloadHeaders({
        filename,
        contentLength: archive.byteLength,
        contentType: "application/zip",
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false, error: "admin-session" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return NextResponse.json({ ok: false, error: "admin-origin" }, { status: 403 });
    }
    const code = error instanceof StockExportError
      ? error.code
      : "stock-download-unavailable";
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "error", code)),
      303,
    );
  } finally {
    archive?.fill(0);
  }
}
