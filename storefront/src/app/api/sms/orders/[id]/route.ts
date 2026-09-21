import type { NextRequest } from "next/server";
import { proxySmsRequest } from "@/lib/sms-proxy";
type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: Context) { return proxySmsRequest(request, "/api/storefront/v1/sms/orders/" + encodeURIComponent((await params).id)); }
export const POST = GET;
