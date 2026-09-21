import { NextResponse } from "next/server";
import { storefrontApiStatus } from "@/lib/telegram-store-api";

export const dynamic = "force-dynamic";

export function GET() {
  const api = storefrontApiStatus();
  return NextResponse.json({
    ok: true,
    service: "telegram-storefront",
    backendConfigured: api.configured,
  });
}
