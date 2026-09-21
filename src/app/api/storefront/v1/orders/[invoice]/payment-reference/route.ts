import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireWebCustomerSession, WebCustomerAccessError } from "@/server/storefront/customer-access";
import { storefrontBearerToken, authenticateStorefrontJsonRequest } from "@/server/storefront/http";
import { submitWebPaymentReference } from "@/server/storefront/payment-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const referenceSchema = z.object({ value: z.string().trim().min(8).max(180) }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ invoice: string }> }) {
  const signed = await authenticateStorefrontJsonRequest(request, 2_048);
  if (!signed.ok) return signed.response;
  const parsed = referenceSchema.safeParse(signed.body);
  if (!parsed.success) return NextResponse.json({ ok: false, code: "invalid_reference" }, { status: 422 });
  try {
    const session = await requireWebCustomerSession(storefrontBearerToken(request));
    const { invoice } = await params;
    const order = await submitWebPaymentReference({ customerId: session.webCustomerId, invoiceNumber: invoice, value: parsed.data.value });
    return NextResponse.json({ ok: true, order }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, code: error instanceof WebCustomerAccessError ? "session_invalid" : "payment_reference_rejected" }, { status: error instanceof WebCustomerAccessError ? 401 : 409 });
  }
}
