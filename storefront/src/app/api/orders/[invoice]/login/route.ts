import { NextResponse, type NextRequest } from "next/server";
import { commerceAccessToken } from "@/lib/commerce-auth";
import { storeApiFetch } from "@/lib/telegram-store-api";
import { storefrontMutationOriginAllowed } from "@/lib/request-rate-limit";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
async function handle(request: NextRequest, context: { params: Promise<{ invoice: string }> }) {
  if (request.method === "POST" && !storefrontMutationOriginAllowed(request)) return NextResponse.json({ ok: false }, { status: 403, headers });
  const token = await commerceAccessToken();
  if (!token) return NextResponse.json({ ok: false }, { status: 401, headers });
  try {
    const { invoice } = await context.params;
    const upstream = await storeApiFetch(`/api/storefront/v1/orders/${encodeURIComponent(invoice)}/login`, { method: request.method, headers: { authorization: "Bearer " + token } });
    return new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers: {
      ...headers, "content-type": upstream.headers.get("content-type") ?? "application/json",
      ...(upstream.ok && request.method === "POST" ? { "content-disposition": 'attachment; filename="BWR-Codex-login.txt"' } : {}),
    } });
  } catch { return NextResponse.json({ ok: false, code: "login_unavailable" }, { status: 503, headers }); }
}
export const GET = handle;
export const POST = handle;
