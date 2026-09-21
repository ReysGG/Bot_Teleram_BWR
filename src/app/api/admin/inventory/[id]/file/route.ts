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
  const item = await prisma.digitalStockItem.findUnique({
    where: { id },
    select: {
      originalFilename: true,
      encryptedPayload: true,
      encryptionIv: true,
      encryptionTag: true,
    },
  });
  if (!item) return NextResponse.json({ ok: false }, { status: 404 });

  try {
    const file = decryptStockFile(item);
    try {
      return new NextResponse(Uint8Array.from(file), {
        headers: sensitiveDownloadHeaders({
          filename: item.originalFilename,
          contentLength: file.byteLength,
        }),
      });
    } finally {
      file.fill(0);
    }
  } catch {
    return NextResponse.json({ ok: false, error: "file-unavailable" }, { status: 500 });
  }
}
