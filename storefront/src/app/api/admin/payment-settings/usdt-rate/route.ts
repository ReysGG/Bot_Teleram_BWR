import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import {
  MAX_USDT_IDR_RATE,
  MIN_USDT_IDR_RATE,
} from "@/server/payment/usdt-amount";
import { setUsdtRateSetting } from "@/server/payment/usdt-rate-setting";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

const schema = z.object({
  rate: z.coerce.number().int().min(MIN_USDT_IDR_RATE).max(MAX_USDT_IDR_RATE),
});

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const input = schema.parse({ rate: form.get("rate") });
    await setUsdtRateSetting({ rate: input.rate, actor: `admin:${admin.email}` });
    return NextResponse.redirect(appRoute("/admin/payment-settings/usdt-rate?notice=usdt_rate"), 303);
  } catch {
    return NextResponse.redirect(appRoute("/admin/payment-settings/usdt-rate?error=usdt_rate"), 303);
  }
}
