import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // A healthy new app must have the schema required by normal catalog reads.
    await prisma.$queryRaw`
      SELECT
        p."descriptionEn",
        p."descriptionEntitiesEn",
        g."descriptionEn",
        g."descriptionEntitiesEn"
      FROM "Product" p
      CROSS JOIN "ProductGroup" g
      LIMIT 0
    `;
    return NextResponse.json({ ok: true, database: "ready" });
  } catch {
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}
