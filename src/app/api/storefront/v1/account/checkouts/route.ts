import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { ActiveInvoiceError } from "@/server/checkout/errors";
import { requireClerkCustomer, ClerkCommerceError } from "@/server/storefront/clerk-identity";
import { authenticateStorefrontJsonRequest, storefrontBearerToken } from "@/server/storefront/http";
import { webCustomerChatId } from "@/server/storefront/customer-access";
import { getWebCustomerOrder } from "@/server/storefront/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store" };
const schema = z.object({
  productId: z.string().min(1).max(80), quantity: z.number().int().min(1).max(750),
  paymentMethod: z.enum(["DANA", "WALLET", "WALLET_QRIS", "JAGO_TRANSFER", "BINANCE_INTERNAL", "USDT_BEP20"]),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9:_-]{16,120}$/),
}).strict();

export async function POST(request: NextRequest) {
  const signed = await authenticateStorefrontJsonRequest(request);
  if (!signed.ok) return signed.response;
  const parsed = schema.safeParse(signed.body);
  if (!parsed.success) return NextResponse.json({ ok: false, code: "invalid_checkout" }, { status: 422, headers });
  try {
    const customer = await requireClerkCustomer(storefrontBearerToken(request) ?? "");
    const created = await createDigitalOrder({ ...parsed.data, channel: "WEB", webCustomerId: customer.id, chatId: webCustomerChatId(customer.id) });
    const order = await getWebCustomerOrder(customer.id, created.invoiceNumber);
    return NextResponse.json({ ok: true, order }, { status: 201, headers });
  } catch (error) {
    if (error instanceof ClerkCommerceError) return NextResponse.json({ ok: false, code: error.code }, { status: error.code === "account_unavailable" ? 503 : error.code === "account_setup_required" ? 409 : 401, headers });
    if (error instanceof ActiveInvoiceError) return NextResponse.json({ ok: false, code: "active_invoice", invoiceNumber: error.invoiceNumber }, { status: 409, headers });
    const message = error instanceof Error ? error.message : "";
    const code = /saldo.*(cukup|kurang)/i.test(message) ? "insufficient_balance" : /stok|preorder|kapasitas|jumlah/i.test(message) ? "stock_unavailable" : /pembayaran|QRIS|wallet|Binance|Jago|USDT/i.test(message) ? "payment_unavailable" : "checkout_unavailable";
    return NextResponse.json({ ok: false, code }, { status: code === "checkout_unavailable" ? 503 : 409, headers });
  }
}
