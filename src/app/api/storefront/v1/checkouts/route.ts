import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ActiveInvoiceError } from "@/server/checkout/errors";
import { createWebCheckout } from "@/server/storefront/checkout";
import { WebCustomerAccessError } from "@/server/storefront/customer-access";
import { authenticateStorefrontJsonRequest } from "@/server/storefront/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const checkoutSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(8).max(72),
  productId: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().int().min(1).max(750),
  paymentMethod: z.enum([
    "DANA",
    "WALLET",
    "WALLET_QRIS",
    "USDT_BEP20",
    "BINANCE_INTERNAL",
    "JAGO_TRANSFER",
  ]),
  idempotencyKey: z.string().trim().min(16).max(120),
}).strict();

export async function POST(request: NextRequest) {
  const signed = await authenticateStorefrontJsonRequest(request, 8_192);
  if (!signed.ok) return signed.response;
  if (process.env.STOREFRONT_CLERK_ENABLED === "true") return NextResponse.json({ ok: false, code: "use_account_checkout" }, { status: 409, headers: { "cache-control": "private, no-store" } });
  const parsed = checkoutSchema.safeParse(signed.body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "invalid_checkout" },
      { status: 422, headers: { "cache-control": "private, no-store" } },
    );
  }
  try {
    const checkout = await createWebCheckout({
      ...parsed.data,
      userAgent: request.headers.get("x-storefront-user-agent"),
    });
    return NextResponse.json(
      {
        ok: true,
        sessionToken: checkout.session.token,
        expiresAt: checkout.session.expiresAt.toISOString(),
        customer: checkout.customer,
        order: checkout.order,
      },
      { status: 201, headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof WebCustomerAccessError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code === "INVALID_PASSWORD" || error.code === "INVALID_CONTACT"
            ? "invalid_checkout"
            : "invalid_credentials",
        },
        {
          status: error.code === "INVALID_PASSWORD" || error.code === "INVALID_CONTACT" ? 422 : 401,
          headers: { "cache-control": "private, no-store" },
        },
      );
    }
    if (error instanceof ActiveInvoiceError) {
      return NextResponse.json(
        {
          ok: false,
          code: "active_invoice",
          invoiceNumber: error.invoiceNumber,
        },
        { status: 409, headers: { "cache-control": "private, no-store" } },
      );
    }
    const message = error instanceof Error ? error.message : "";
    const code = /stok|preorder/i.test(message)
      ? "stock_unavailable"
      : /pembayaran|QRIS|wallet|Binance|Jago|USDT/i.test(message)
        ? "payment_unavailable"
        : "checkout_unavailable";
    return NextResponse.json(
      { ok: false, code },
      { status: code === "checkout_unavailable" ? 503 : 409, headers: { "cache-control": "private, no-store" } },
    );
  }
}
