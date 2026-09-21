import { commerceAccessToken } from "@/lib/commerce-auth";
import { NextResponse, type NextRequest } from "next/server";
import { refreshCustomerPayment } from "@/lib/store-api";
import { StoreApiError } from "@/lib/telegram-store-api";
import { storefrontMutationOriginAllowed } from "@/lib/request-rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ invoice: string }> }) {
  if (!storefrontMutationOriginAllowed(request)) return NextResponse.json({ ok: false, code: "invalid_origin" }, { status: 403 });
  const token = await commerceAccessToken();
  if (!token) return NextResponse.json({ ok: false, code: "session_invalid" }, { status: 401 });
  const { invoice } = await params;
  try {
    const result = await refreshCustomerPayment(token, invoice);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, code: error instanceof StoreApiError ? error.code : "payment_refresh_failed" }, { status: error instanceof StoreApiError ? error.status : 409 });
  }
}
