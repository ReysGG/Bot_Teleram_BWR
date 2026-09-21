import { NextResponse, type NextRequest } from "next/server";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import { loadStorefrontCatalogSnapshot } from "@/server/storefront/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authentication = authenticateStorefrontRequest(request);
  if (!authentication.ok) {
    return NextResponse.json(
      { ok: false, code: authentication.code === "CONFIGURATION" ? "unavailable" : "unauthorized" },
      {
        status: authentication.status,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }

  try {
    const catalog = await loadStorefrontCatalogSnapshot();
    return NextResponse.json(catalog, {
      headers: {
        "cache-control": "private, no-store",
        "x-storefront-request-id": authentication.requestId,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, code: "catalog_unavailable" },
      {
        status: 503,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
}
