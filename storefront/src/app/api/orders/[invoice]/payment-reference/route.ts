import { commerceAccessToken } from "@/lib/commerce-auth";
import { NextResponse, type NextRequest } from "next/server";
import { submitCustomerPaymentReference } from "@/lib/store-api";
import { StoreApiError } from "@/lib/telegram-store-api";
import { storefrontMutationOriginAllowed } from "@/lib/request-rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ invoice: string }> }) {
  if (!storefrontMutationOriginAllowed(request)) return NextResponse.json({ ok: false, code: "invalid_origin" }, { status: 403 });
  const token = await commerceAccessToken();
  if (!token) return NextResponse.json({ ok: false, code: "session_invalid" }, { status: 401 });
  let body: { value?: unknown };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ ok: false, code: "invalid_reference" }, { status: 422 }); }
  if (typeof body.value !== "string" || body.value.trim().length < 8 || body.value.length > 180) {
    return NextResponse.json({ ok: false, code: "invalid_reference" }, { status: 422 });
  }
  const { invoice } = await params;
  try {
    const result = await submitCustomerPaymentReference(token, invoice, body.value);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, code: error instanceof StoreApiError ? error.code : "payment_reference_rejected" }, { status: error instanceof StoreApiError ? error.status : 409 });
  }
}
