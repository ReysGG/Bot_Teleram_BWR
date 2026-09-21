import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { publicCatalogImageResponse } from "@/server/products/public-image-response";
import { activePublicProductWhere } from "@/server/products/visibility";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: activePublicProductWhere(id),
    select: { imageUrl: true },
  });
  if (!product) return new NextResponse(null, { status: 404 });
  return publicCatalogImageResponse(product.imageUrl);
}
