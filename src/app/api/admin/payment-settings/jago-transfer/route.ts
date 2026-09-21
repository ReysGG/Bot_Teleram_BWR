import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import { setJagoTransferSetting } from "@/server/payment/jago-transfer";
import { getPaymentMethodAvailability } from "@/server/payment/method-availability";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

const schema = z.object({
  accountNumber: z.string().trim().max(32),
});

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const input = schema.parse({
      accountNumber: String(form.get("accountNumber") ?? ""),
    });
    const paymentMethods = await getPaymentMethodAvailability();
    await setJagoTransferSetting({
      enabled: paymentMethods.jagoTransferEnabled,
      accountNumber: input.accountNumber || null,
      actor: `admin:${admin.email}`,
    });
    return NextResponse.redirect(appRoute("/admin/payment-settings/jago?notice=jago_transfer_settings"), 303);
  } catch {
    return NextResponse.redirect(appRoute("/admin/payment-settings/jago?error=jago_transfer_settings"), 303);
  }
}
