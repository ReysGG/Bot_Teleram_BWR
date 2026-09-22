import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { requireAdminRequest } from "@/server/security/admin-auth";

export const runtime = "nodejs";

const STORED_IMAGE_PATTERN = /^data:(image\/(?:gif|jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/;

function imageHeaders(contentType: string, contentLength: number) {
  return {
    "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
    "Content-Length": String(contentLength),
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
  };
}

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
  const product = await prisma.product.findUnique({
    where: { id },
    select: { imageUrl: true },
  });
  if (!product?.imageUrl) {
    return new NextResponse(null, { status: 204 });
  }

  const stored = STORED_IMAGE_PATTERN.exec(product.imageUrl);
  if (stored) {
    const content = Buffer.from(stored[2], "base64");
    return new NextResponse(Uint8Array.from(content), {
      headers: imageHeaders(stored[1], content.byteLength),
    });
  }

  try {
    const external = new URL(product.imageUrl);
    if (external.protocol !== "https:" && external.protocol !== "http:") {
      throw new Error("unsupported image protocol");
    }
    return NextResponse.redirect(external, 307);
  } catch {
    return NextResponse.json({ ok: false }, { status: 422 });
  }
}
