import { NextResponse, type NextRequest } from "next/server";
import { appUrl, booleanEnv } from "@/server/env";
import { prisma } from "@/server/db/prisma";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import {
  requireWebCustomerSession,
  WebCustomerAccessError,
} from "@/server/storefront/customer-access";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import {
  storefrontAuthenticationResponse,
  storefrontBearerToken,
} from "@/server/storefront/http";
import { getWebCustomerOrder } from "@/server/storefront/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function localTestPaymentEnabled() {
  const hostname = appUrl().hostname;
  return booleanEnv("STOREFRONT_TEST_PAYMENT_ENABLED", false) &&
    ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invoice: string }> },
) {
  if (!localTestPaymentEnabled()) return new NextResponse(null, { status: 404 });
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
      select: { id: true, invoiceNumber: true },
    });
    if (!order) {
      return NextResponse.json({ ok: false, code: "order_not_found" }, { status: 404 });
    }
    await confirmOrderPayment({
      orderId: order.id,
      verifiedBy: "storefront-local-test",
    });
    return NextResponse.json({
      ok: true,
      order: await getWebCustomerOrder(session.webCustomerId, order.invoiceNumber),
    });
  } catch (error) {
    const sessionError = error instanceof WebCustomerAccessError;
    return NextResponse.json(
      { ok: false, code: sessionError ? "session_invalid" : "test_confirmation_failed" },
      { status: sessionError ? 401 : 409 },
    );
  }
}
