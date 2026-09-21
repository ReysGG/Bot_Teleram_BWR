import { NextResponse, type NextRequest } from "next/server";
import { processPendingBinanceWebPayments } from "@/server/payment/binance-web-matching";
import { verifyCronAuthorization } from "@/server/security/cron";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    ...(await processPendingBinanceWebPayments()),
  });
}

export const GET = POST;
