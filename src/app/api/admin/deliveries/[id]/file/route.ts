import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { sensitiveDownloadHeaders } from "@/server/files/download";
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
  const delivery = await prisma.sentDelivery.findUnique({
    where: { id },
    select: {
      orderId: true,
      stockItemId: true,
      status: true,
      stockItem: {
        select: {
          id: true,
          originalFilename: true,
          encryptedPayload: true,
          encryptionIv: true,
          encryptionTag: true,
          status: true,
          deliveredOrderId: true,
        },
      },
    },
  });
  if (!delivery) return NextResponse.json({ ok: false }, { status: 404 });
  if (
    delivery.status !== "SENT" ||
    delivery.stockItem.status !== "DELIVERED" ||
    delivery.stockItem.id !== delivery.stockItemId ||
    delivery.stockItem.deliveredOrderId !== delivery.orderId
  ) {
    return NextResponse.json(
      { ok: false, error: "delivered-file-unavailable" },
      { status: 409 },
    );
  }

  try {
    const file = decryptStockFile(delivery.stockItem);
    try {
      return new NextResponse(Uint8Array.from(file), {
        headers: sensitiveDownloadHeaders({
          filename: delivery.stockItem.originalFilename,
          contentLength: file.byteLength,
        }),
      });
    } finally {
      file.fill(0);
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "delivered-file-unavailable" },
      { status: 409 },
    );
  }
}
