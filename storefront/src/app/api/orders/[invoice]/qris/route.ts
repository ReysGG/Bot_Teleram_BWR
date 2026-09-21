import { commerceAccessToken } from "@/lib/commerce-auth";
import { NextResponse, type NextRequest } from "next/server";
import { clearCustomerSessionCookie } from "@/lib/customer-session";
import { loadCustomerOrderAsset } from "@/lib/store-api";
import { StoreApiError } from "@/lib/telegram-store-api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ invoice: string }> },
) {
  const sessionToken = await commerceAccessToken();
  if (!sessionToken) return new NextResponse(null, { status: 401 });
  const { invoice } = await params;
  try {
    const upstream = await loadCustomerOrderAsset(
      sessionToken,
      `/api/storefront/v1/orders/${encodeURIComponent(invoice)}/qris`,
    );
    return new NextResponse(await upstream.arrayBuffer(), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": upstream.headers.get("content-type") ?? "image/png",
        "content-disposition": upstream.headers.get("content-disposition") ?? "inline",
      },
    });
  } catch (error) {
    const unauthorized = error instanceof StoreApiError && error.status === 401;
    const response = NextResponse.json(
      { ok: false, code: unauthorized ? "session_invalid" : "qris_unavailable" },
      { status: unauthorized ? 401 : 503 },
    );
    if (unauthorized) clearCustomerSessionCookie(response);
    return response;
  }
}
