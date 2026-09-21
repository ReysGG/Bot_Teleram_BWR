import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  authenticateWebCustomer,
  WebCustomerAccessError,
} from "@/server/storefront/customer-access";
import { authenticateStorefrontJsonRequest } from "@/server/storefront/http";
import { listWebCustomerOrders, webCustomerWalletBalance } from "@/server/storefront/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const accessSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(72),
}).strict();

export async function POST(request: NextRequest) {
  const signed = await authenticateStorefrontJsonRequest(request);
  if (!signed.ok) return signed.response;
  if (process.env.STOREFRONT_CLERK_ENABLED === "true") return NextResponse.json({ ok: false, code: "use_account_linking" }, { status: 409, headers: { "cache-control": "private, no-store" } });
  const parsed = accessSchema.safeParse(signed.body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "invalid_input" },
      { status: 422, headers: { "cache-control": "private, no-store" } },
    );
  }
  try {
    const { customer, session } = await authenticateWebCustomer({
      ...parsed.data,
      userAgent: request.headers.get("x-storefront-user-agent"),
    });
    const [orders, walletBalance] = await Promise.all([
      listWebCustomerOrders(customer.id),
      webCustomerWalletBalance(customer.id),
    ]);
    return NextResponse.json(
      {
        ok: true,
        sessionToken: session.token,
        expiresAt: session.expiresAt.toISOString(),
        customer: { contactMasked: customer.contactMasked, walletBalance },
        orders,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof WebCustomerAccessError) {
      return NextResponse.json(
        { ok: false, code: "invalid_credentials" },
        { status: 401, headers: { "cache-control": "private, no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, code: "access_unavailable" },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  }
}
