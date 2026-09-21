import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { renderQrisInvoice } from "@/server/payment/qris-invoice";
import {
  requireWebCustomerSession,
  WebCustomerAccessError,
} from "@/server/storefront/customer-access";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import {
  storefrontAuthenticationResponse,
  storefrontBearerToken,
} from "@/server/storefront/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoice: string }> },
) {
  const authentication = authenticateStorefrontRequest(request);
  if (!authentication.ok) return storefrontAuthenticationResponse(authentication);
  try {
    const session = await requireWebCustomerSession(storefrontBearerToken(request));
    const { invoice } = await params;
    const order = await prisma.order.findFirst({
      where: {
        invoiceNumber: invoice.trim().toUpperCase(),
        webCustomerId: session.webCustomerId,
        channel: "WEB",
      },
      include: { payment: true, qrisInvoiceAttempt: true },
    });
    if (!order?.payment || !order.qrisInvoiceAttempt) {
      return NextResponse.json(
        { ok: false, code: "qris_not_found" },
        { status: 404, headers: { "cache-control": "private, no-store" } },
      );
    }
    const rendered = await renderQrisInvoice({
      amount: order.payment.billedAmount,
      attempt: order.qrisInvoiceAttempt,
    });
    return new NextResponse(new Uint8Array(rendered.png), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "image/png",
        "content-disposition": `inline; filename="${order.invoiceNumber}-qris.png"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, code: error instanceof WebCustomerAccessError ? "session_invalid" : "qris_unavailable" },
      { status: error instanceof WebCustomerAccessError ? 401 : 503, headers: { "cache-control": "private, no-store" } },
    );
  }
}
