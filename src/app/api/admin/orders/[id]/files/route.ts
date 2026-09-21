import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { sensitiveDownloadHeaders } from "@/server/files/download";
import { createZipArchive } from "@/server/files/zip";
import { requireAdminRequest } from "@/server/security/admin-auth";
import { decryptStockFile } from "@/server/stock/inventory";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireAdminRequest(request);
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      invoiceNumber: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          stockItem: {
            select: {
              id: true,
              originalFilename: true,
              encryptedPayload: true,
              encryptionIv: true,
              encryptionTag: true,
              status: true,
              deliveredOrderId: true,
              deliveryReceipt: {
                select: {
                  orderId: true,
                  stockItemId: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ ok: false, error: "order-not-found" }, { status: 404 });
  }

  const eligibleStock = order.items.flatMap(({ stockItem }) => {
    const receipt = stockItem?.deliveryReceipt;
    if (
      !stockItem ||
      stockItem.status !== "DELIVERED" ||
      stockItem.deliveredOrderId !== id ||
      !receipt ||
      receipt.status !== "SENT" ||
      receipt.orderId !== id ||
      receipt.stockItemId !== stockItem.id
    ) {
      return [];
    }
    return [stockItem];
  });

  if (eligibleStock.length === 0) {
    return NextResponse.json(
      { ok: false, error: "delivered-files-unavailable" },
      { status: 409 },
    );
  }

  const downloadable: Array<{ filename: string; content: Buffer }> = [];
  try {
    for (const stockItem of eligibleStock) {
      downloadable.push({
        filename: stockItem.originalFilename,
        content: decryptStockFile(stockItem),
      });
    }
  } catch {
    for (const file of downloadable) file.content.fill(0);
    return NextResponse.json(
      { ok: false, error: "delivered-files-unavailable" },
      { status: 409 },
    );
  }

  let archive: Buffer;
  try {
    archive = createZipArchive(downloadable);
  } finally {
    for (const file of downloadable) file.content.fill(0);
  }
  const archiveFilename = `${order.invoiceNumber}-produk.zip`;
  const responseBody = Uint8Array.from(archive);
  archive.fill(0);

  return new NextResponse(responseBody, {
    headers: sensitiveDownloadHeaders({
      filename: archiveFilename,
      contentLength: archive.byteLength,
      contentType: "application/zip",
    }),
  });
}
