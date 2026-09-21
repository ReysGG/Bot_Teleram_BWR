import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { publicCatalogImageResponse } from "@/server/products/public-image-response";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const group = await prisma.productGroup.findFirst({
    where: { id, status: "ACTIVE" },
    select: { imageUrl: true },
  });
  if (!group) return new NextResponse(null, { status: 404 });
  return publicCatalogImageResponse(group.imageUrl);
}
