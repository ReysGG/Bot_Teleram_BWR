import type { NextRequest } from "next/server";
import { proxySmsRequest } from "@/lib/sms-proxy";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) { return proxySmsRequest(request, "/api/storefront/v1/sms" + request.nextUrl.search); }
export function POST(request: NextRequest) { return proxySmsRequest(request, "/api/storefront/v1/sms"); }
