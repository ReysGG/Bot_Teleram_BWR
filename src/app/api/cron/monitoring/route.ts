import { NextResponse, type NextRequest } from "next/server";
import {
  loadStoreHealthSnapshot,
  queueProactiveAdminAlerts,
} from "@/server/monitoring/store-health";
import { verifyCronAuthorization } from "@/server/security/cron";
import { pruneExpiredWebCustomerSessions } from "@/server/storefront/customer-access";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const [snapshot, prunedSessions] = await Promise.all([
    loadStoreHealthSnapshot(),
    pruneExpiredWebCustomerSessions(),
  ]);
  const queuedAlerts = await queueProactiveAdminAlerts(snapshot);
  return NextResponse.json({
    ok: true,
    severity: snapshot.severity,
    issueCount: snapshot.issues.length,
    queuedAlerts,
    prunedWebSessions: prunedSessions.count,
  });
}

export const GET = POST;
