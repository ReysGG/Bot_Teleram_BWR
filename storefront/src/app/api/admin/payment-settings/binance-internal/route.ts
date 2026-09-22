import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import { setBinanceInternalSetting } from "@/server/payment/binance-internal-setting";
import { getPaymentMethodAvailability } from "@/server/payment/method-availability";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

const schema = z.object({
  recipientId: z.string().trim().max(32),
});

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const input = schema.parse({
      recipientId: String(form.get("recipientId") ?? ""),
    });
    const paymentMethods = await getPaymentMethodAvailability();
    await setBinanceInternalSetting({
      enabled: paymentMethods.binanceInternalEnabled,
      recipientId: input.recipientId || null,
      actor: `admin:${admin.email}`,
    });
    return NextResponse.redirect(appRoute("/admin/payment-settings/binance?notice=binance_internal_settings"), 303);
  } catch {
    return NextResponse.redirect(appRoute("/admin/payment-settings/binance?error=binance_internal_settings"), 303);
  }
}
