import { commerceAccessToken } from "@/lib/commerce-auth";
import { NextResponse, type NextRequest } from "next/server";
import { confirmLocalTestOrder } from "@/lib/store-api";
import { storefrontMutationOriginAllowed } from "@/lib/request-rate-limit";
import { localTestPaymentsAllowed } from "@/lib/test-payments";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invoice: string }> },
) {
  if (!localTestPaymentsAllowed()) return new NextResponse(null, { status: 404 });
  if (!storefrontMutationOriginAllowed(request)) {
    return NextResponse.json({ ok: false, code: "invalid_origin" }, { status: 403 });
  }
  const sessionToken = await commerceAccessToken();
  if (!sessionToken) return NextResponse.json({ ok: false, code: "session_invalid" }, { status: 401 });
  const { invoice } = await params;
  try {
    const result = await confirmLocalTestOrder(sessionToken, invoice);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, code: "test_confirmation_failed" }, { status: 409 });
  }
}
