import { commerceAccessToken } from "@/lib/commerce-auth";
import { NextResponse, type NextRequest } from "next/server";
import { clearCustomerSessionCookie } from "@/lib/customer-session";
import { loadCustomerOrderAsset } from "@/lib/store-api";
import { StoreApiError } from "@/lib/telegram-store-api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ invoice: string; receiptId: string }> },
) {
  const sessionToken = await commerceAccessToken();
  if (!sessionToken) return new NextResponse(null, { status: 401 });
  const { invoice, receiptId } = await params;
  try {
    const upstream = await loadCustomerOrderAsset(
      sessionToken,
      `/api/storefront/v1/orders/${encodeURIComponent(invoice)}/deliveries/${encodeURIComponent(receiptId)}`,
    );
    return new NextResponse(await upstream.arrayBuffer(), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "content-disposition": upstream.headers.get("content-disposition") ?? "attachment",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const unauthorized = error instanceof StoreApiError && error.status === 401;
    const notReady = error instanceof StoreApiError && error.status === 409;
    const notFound = error instanceof StoreApiError && error.status === 404;
    const response = NextResponse.json(
      {
        ok: false,
        code: unauthorized
          ? "session_invalid"
          : notReady
            ? "delivery_not_ready"
            : notFound
              ? "delivery_not_found"
              : "delivery_unavailable",
      },
      { status: unauthorized ? 401 : notReady ? 409 : notFound ? 404 : 503 },
    );
    if (unauthorized) clearCustomerSessionCookie(response);
    return response;
  }
}
