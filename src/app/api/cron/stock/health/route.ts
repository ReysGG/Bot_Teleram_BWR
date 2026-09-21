import { NextResponse, type NextRequest } from "next/server";
import { allocateAllPaidPreorders } from "@/server/preorder/allocate-stock";
import { verifyCronAuthorization } from "@/server/security/cron";
import { checkDueStockItems } from "@/server/stock/health-check";

export const runtime = "nodejs";
export const maxDuration = 60;

async function processStockHealth() {
  const health = await checkDueStockItems();
  const allocatedPreorders = health.enabled
    ? await allocateAllPaidPreorders(25)
    : 0;
  return { health, allocatedPreorders };
}

let activeRun: ReturnType<typeof processStockHealth> | null = null;

export async function POST(request: NextRequest) {
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  activeRun ??= processStockHealth().finally(() => {
    activeRun = null;
  });
  return NextResponse.json({ ok: true, ...(await activeRun) });
}

export const GET = POST;
