import { NextRequest, NextResponse } from "next/server";
import { expandStockFiles, importStockFiles, StockImportError } from "@/server/stock/inventory";
import { checkStockItems } from "@/server/stock/health-check";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";
import { enqueueProductRestock } from "@/server/telegram/product-broadcast";
import { requireActiveSeller } from "@/server/seller/access";
import { assertAdminOrigin } from "@/server/security/admin-auth";
import { prisma } from "@/server/db/prisma";
import { cleanError } from "@/server/utils/format";
import { MAX_PASTED_STOCK_BYTES, MAX_STOCK_ITEMS_PER_UPLOAD, normalizePastedStockLines } from "@/lib/stock-upload";

export const runtime = "nodejs";
const MAX_UPLOAD_BODY_BYTES = 64 * 1024 * 1024;
const RESPONSE_HEADER = "x-admin-form-response";

function response(request: NextRequest, redirectTo: string, error?: string, status = 200) {
  if (request.headers.get(RESPONSE_HEADER) === "json") {
    return error
      ? NextResponse.json({ ok: false, error }, { status })
      : NextResponse.json({ ok: true, redirectTo }, { status });
  }
  return NextResponse.redirect(new URL(error ? `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}` : redirectTo, request.url), 303);
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const destination = `/seller/products/${encodeURIComponent(id)}/stock`;
  let buffers: Buffer[] = [];
  try {
    assertAdminOrigin(request);
    const seller = await requireActiveSeller();
    const product = await prisma.product.findFirst({ where: { id, sellerId: seller.id }, select: { id: true, name: true } });
    if (!product) return response(request, destination, "seller-product-not-found", 404);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_UPLOAD_BODY_BYTES) return response(request, destination, "stock-upload-too-large", 413);
    const form = await request.formData();
    const requestKey = String(form.get("requestKey") ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) return response(request, destination, "stock-request-key-invalid", 422);
    const files = form.getAll("files").filter((value): value is File => value instanceof File && (value.name.trim().length > 0 || value.size > 0));
    const stockFiles = await Promise.all(files.map(async (file) => ({ filename: file.name, content: Buffer.from(await file.arrayBuffer()) })));
    buffers = stockFiles.map((file) => file.content);
    const rawLines = form.get("stockLines");
    const normalizedLines = normalizePastedStockLines(typeof rawLines === "string" ? rawLines : "");
    if (normalizedLines.length > MAX_STOCK_ITEMS_PER_UPLOAD) throw new StockImportError("stock-file-count", "Too many stock items");
    const normalizedText = normalizedLines.join("\n");
    if (Buffer.byteLength(normalizedText, "utf8") > MAX_PASTED_STOCK_BYTES) throw new StockImportError("stock-lines-too-large", "Pasted stock is too large");
    if (normalizedLines.length) { const content = Buffer.from(normalizedText, "utf8"); stockFiles.push({ filename: `pasted-stock-${requestKey}.txt`, content }); buffers.push(content); }
    if (stockFiles.reduce((total, file) => total + file.content.byteLength, 0) > MAX_UPLOAD_BODY_BYTES) return response(request, destination, "stock-upload-too-large", 413);
    const originalBuffers = stockFiles.map((file) => file.content);
    const expandedForCount = expandStockFiles(stockFiles);
    const processed = expandedForCount.length;
    for (const file of expandedForCount) if (!originalBuffers.some((original) => original === file.content)) file.content.fill(0);
    if (processed > MAX_STOCK_ITEMS_PER_UPLOAD) throw new StockImportError("stock-file-count", "Too many stock items");
    const imported = await importStockFiles({ productId: product.id, files: stockFiles });
    const check = await checkStockItems(imported.map((item) => item.id));
    const allocated = await allocatePaidPreorders(product.id);
    try { await enqueueProductRestock({ productId: product.id, addedCount: imported.length, batchId: requestKey }); } catch (error) { console.warn("[Seller product restock notification]", cleanError(error)); }
    const query = new URLSearchParams({ notice: "stock-uploaded", imported: String(imported.length), processed: String(processed), skipped: String(Math.max(0, processed - imported.length)), healthy: String(check.healthy), banned: String(check.banned), errors: String(check.errors), allocated: String(allocated) });
    return response(request, `${destination}?${query.toString()}`);
  } catch (error) {
    const code = error instanceof StockImportError ? error.code : error instanceof Error && error.message === "INVALID_ORIGIN" ? "admin-origin" : error instanceof Error && error.message === "UNAUTHORIZED" ? "seller-access-required" : "stock-upload";
    console.warn("[Seller inventory upload]", cleanError(error));
    return response(request, destination, code, code === "seller-access-required" ? 403 : code === "admin-origin" ? 403 : 422);
  } finally { for (const buffer of buffers) buffer.fill(0); }
}
