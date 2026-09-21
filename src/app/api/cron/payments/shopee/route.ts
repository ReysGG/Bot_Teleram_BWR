import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuthorization } from "@/server/security/cron";
import { pollActiveShopeePartnerSessions } from "@/server/payment/shopee-partner-worker";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await pollActiveShopeePartnerSessions();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = POST;
