import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuthorization } from "@/server/security/cron";
import { queueReengagementBatch } from "@/server/telegram/reengagement";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    data: await queueReengagementBatch(),
  });
}

export const GET = POST;
