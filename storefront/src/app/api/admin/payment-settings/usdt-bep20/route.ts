import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import { setUsdtBep20Setting } from "@/server/payment/usdt-bep20-setting";
import { getPaymentMethodAvailability } from "@/server/payment/method-availability";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

const schema = z.object({
  recipientAddress: z.string().trim().max(42),
  minimumConfirmations: z.coerce.number().int().min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const input = schema.parse({
      recipientAddress: String(form.get("recipientAddress") ?? ""),
      minimumConfirmations: form.get("minimumConfirmations"),
    });
    const paymentMethods = await getPaymentMethodAvailability();
    await setUsdtBep20Setting({
      enabled: paymentMethods.usdtBep20Enabled,
      recipientAddress: input.recipientAddress || null,
      requiredConfirmations: input.minimumConfirmations,
      actor: `admin:${admin.email}`,
    });
    return NextResponse.redirect(
      appRoute("/admin/payment-settings/usdt-bep20?notice=usdt_bep20_settings"),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute("/admin/payment-settings/usdt-bep20?error=usdt_bep20_settings"),
      303,
    );
  }
}
