import { NextResponse, type NextRequest } from "next/server";
import { expirePendingOrders } from "@/server/payment/expire-orders";
import { expirePendingWalletTopups } from "@/server/wallet/topup";
import { verifyCronAuthorization } from "@/server/security/cron";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const [orders, walletTopups] = await Promise.all([
    expirePendingOrders(),
    expirePendingWalletTopups(),
  ]);
  return NextResponse.json({ ok: true, expired: { orders, walletTopups } });
}

export const GET = POST;
