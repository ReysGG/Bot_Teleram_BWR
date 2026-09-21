import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuthorization } from "@/server/security/cron";
import { processPendingUsdtBep20Attempts } from "@/server/payment/usdt-bep20";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { if (!verifyCronAuthorization(request.headers.get("authorization"))) return NextResponse.json({ ok: false }, { status: 401 }); return NextResponse.json({ ok: true, ...(await processPendingUsdtBep20Attempts(25)) }); }
export const GET = POST;
