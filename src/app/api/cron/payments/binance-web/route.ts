import { NextResponse, type NextRequest } from "next/server";
import { pollBinanceWebSessions } from "@/server/payment/binance-web-worker";
import { verifyCronAuthorization } from "@/server/security/cron";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await pollBinanceWebSessions()) });
}

export const GET = POST;
