import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuthorization } from "@/server/security/cron";
import { processPendingShopeePartnerPayments } from "@/server/payment/shopee-partner-payment-worker";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    ...(await processPendingShopeePartnerPayments()),
  });
}

export const GET = POST;
