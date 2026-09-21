import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import {
  importStockFiles,
  expandStockFiles,
  StockImportError,
} from "@/server/stock/inventory";
import { checkStockItems } from "@/server/stock/health-check";
import { cleanError } from "@/server/utils/format";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";
import { enqueueProductRestock } from "@/server/telegram/product-broadcast";
import { prisma } from "@/server/db/prisma";
import { sellableStockWhere } from "@/server/stock/sellable";
import { normalizeInventoryReturnUrl } from "@/server/admin/inventory";
import {
  adminResultReturnPath,
  buildAdminReturnPath,
} from "@/server/admin/return-path";
import { adminFormFailure, adminFormSuccess } from "@/server/admin/form-response";
import {
  MAX_PASTED_STOCK_BYTES,
  MAX_STOCK_ITEMS_PER_UPLOAD,
  normalizePastedStockLines,
} from "@/lib/stock-upload";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let productId = "";
  let returnTo = "";
  let stockFiles: Array<{ filename: string; content: Buffer }> = [];
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    productId = String(form.get("productId") ?? "");
    returnTo = String(form.get("returnTo") ?? "");
    const files = form.getAll("files").filter(
      (value): value is File => value instanceof File && (
        value.name.trim().length > 0 || value.size > 0
      ),
    );
    stockFiles = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        content: Buffer.from(await file.arrayBuffer()),
      })),
    );
    const stockLinesValue = form.get("stockLines");
    const stockLines = typeof stockLinesValue === "string" ? stockLinesValue : "";
    const normalizedLines = normalizePastedStockLines(stockLines);
    if (normalizedLines.length > MAX_STOCK_ITEMS_PER_UPLOAD) {
      throw new StockImportError(
        "stock-file-count",
        `Paste menghasilkan lebih dari ${MAX_STOCK_ITEMS_PER_UPLOAD} stok`,
      );
    }
    const normalizedStockText = normalizedLines.join("\n");
    if (Buffer.byteLength(normalizedStockText, "utf8") > MAX_PASTED_STOCK_BYTES) {
      throw new StockImportError(
        "stock-lines-too-large",
        "Pasted stock exceeds the 1 MB request limit",
      );
    }
    if (normalizedLines.length > 0) {
      stockFiles.push({
        filename: "pasted-stock.txt",
        content: Buffer.from(normalizedStockText, "utf8"),
      });
    }
    const originalBuffers = new Set(stockFiles.map((file) => file.content));
    const expandedForCount = expandStockFiles(stockFiles);
    const processed = expandedForCount.length;
    for (const file of expandedForCount) {
      if (!originalBuffers.has(file.content)) file.content.fill(0);
    }
    const imported = await importStockFiles({
      productId,
      files: stockFiles,
    });
    const check = await checkStockItems(imported.map((item) => item.id));
    const allocated = await allocatePaidPreorders(productId);
    const sellableImported = imported.length
      ? await prisma.digitalStockItem.count({
          where: {
            id: { in: imported.map((item) => item.id) },
            archivedAt: null,
            status: "AVAILABLE",
            ...sellableStockWhere(),
          },
        })
      : 0;
    try {
      await enqueueProductRestock({
        productId,
        addedCount: sellableImported,
        batchId: randomUUID(),
      });
    } catch (error) {
      console.warn("[Product restock notification]", cleanError(error));
    }
    const editDestination = `/admin/products/${productId}/edit`;
    const stockDestination = `/admin/products/${productId}/stock`;
    const destination = returnTo === editDestination
      ? editDestination
      : normalizeInventoryReturnUrl(returnTo, stockDestination);
    const resultPath = adminResultReturnPath(
      destination,
      "notice",
      "stock-uploaded",
      stockDestination,
    );
    const resultUrl = buildAdminReturnPath({
      pathname: resultPath,
      query: {
      imported: String(imported.length),
      processed: String(processed),
      skipped: String(Math.max(0, processed - imported.length)),
      healthy: String(check.healthy),
      banned: String(check.banned),
      ready: String(sellableImported),
      errors: String(check.errors),
      allocated: String(allocated),
      },
      fragment: destination.includes("#inventory-ledger")
        ? "inventory-ledger"
        : undefined,
    });
    return adminFormSuccess(request, resultUrl);
  } catch (error) {
    console.warn("[Admin inventory upload]", cleanError(error));
    const code = error instanceof StockImportError ? error.code : "stock-upload";
    const editDestination = `/admin/products/${productId}/edit`;
    const stockDestination = productId
      ? `/admin/products/${encodeURIComponent(productId)}/stock`
      : "/admin/products";
    const destination = productId && returnTo === editDestination
      ? editDestination
      : productId
        ? normalizeInventoryReturnUrl(returnTo, stockDestination)
        : stockDestination;
    const failureDestination = adminResultReturnPath(
      destination,
      "error",
      code,
      stockDestination,
    );
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return adminFormFailure(request, failureDestination, "admin-session", 401);
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return adminFormFailure(request, failureDestination, "admin-origin", 403);
    }
    return adminFormFailure(
      request,
      failureDestination,
      code,
      error instanceof StockImportError ? 422 : 500,
    );
  } finally {
    for (const file of stockFiles) file.content.fill(0);
  }
}
