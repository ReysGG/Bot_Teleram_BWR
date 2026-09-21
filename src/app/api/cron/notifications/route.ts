import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuthorization } from "@/server/security/cron";
import { allocateAllPaidPreorders } from "@/server/preorder/allocate-stock";
import { refreshActiveSmsPoolOrders } from "@/server/smspool/customer-orders";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const allocatedPreorders = await allocateAllPaidPreorders(25);
  const smsPool = await refreshActiveSmsPoolOrders(50).catch(() => ({
    checked: 0,
    completed: 0,
  }));
  return NextResponse.json({
    ok: true,
    allocatedPreorders,
    smsPool,
  });
}

export const GET = POST;
