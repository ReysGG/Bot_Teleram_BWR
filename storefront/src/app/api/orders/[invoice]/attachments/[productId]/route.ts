import { commerceAccessToken } from "@/lib/commerce-auth";
import { NextResponse, type NextRequest } from "next/server";
import {
  clearCustomerSessionCookie,
} from "@/lib/customer-session";
import { loadCustomerOrderAsset } from "@/lib/store-api";
import { StoreApiError } from "@/lib/telegram-store-api";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ invoice: string; productId: string }> }) {
  const token = await commerceAccessToken();
  if (!token) return new NextResponse(null, { status: 401 });
  const { invoice, productId } = await params;
  try {
    const upstream = await loadCustomerOrderAsset(token, `/api/storefront/v1/orders/${encodeURIComponent(invoice)}/attachments/${encodeURIComponent(productId)}`);
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
    const notFound = error instanceof StoreApiError && error.status === 404;
    const response = NextResponse.json(
      {
        ok: false,
        code: unauthorized
          ? "session_invalid"
          : notFound
            ? "attachment_not_found"
            : "attachment_unavailable",
      },
      { status: unauthorized ? 401 : notFound ? 404 : 503 },
    );
    if (unauthorized) clearCustomerSessionCookie(response);
    return response;
  }
}
