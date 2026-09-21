import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuthorization } from "@/server/security/cron";
import { processPendingBinanceInternalAttempts } from "@/server/payment/binance-internal";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    ...(await processPendingBinanceInternalAttempts(25)),
  });
}
export const GET = POST;
