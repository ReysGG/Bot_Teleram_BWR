import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import {
  setPaymentMethodAvailability,
} from "@/server/payment/method-availability";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

const booleanField = z.enum(["true", "false"]).transform((value) => value === "true");
const schema = z.object({
  qrisDanaEnabled: booleanField,
  walletCheckoutEnabled: booleanField,
  mixedWalletQrisEnabled: booleanField,
  walletTopupEnabled: booleanField,
  jagoTransferEnabled: booleanField,
  binanceInternalEnabled: booleanField,
  usdtBep20Enabled: booleanField,
});

const allowedReturnPaths = new Set(["/admin/payment-settings"]);

function paymentSettingsReturnPath(value: FormDataEntryValue | null) {
  return typeof value === "string" && allowedReturnPaths.has(value)
    ? value
    : "/admin/payment-settings";
}

export async function POST(request: NextRequest) {
  let returnTo = "/admin/payment-settings";
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    returnTo = paymentSettingsReturnPath(form.get("returnTo"));
    const input = schema.parse(Object.fromEntries(
      Object.keys(schema.shape).map((key) => [key, String(form.get(key) ?? "false")]),
    ));

    await setPaymentMethodAvailability({
      ...input,
      actor: `admin:${admin.email}`,
    });
    return NextResponse.redirect(
      appRoute(`${returnTo}?notice=payment_methods`),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(`${returnTo}?error=payment_methods`),
      303,
    );
  }
}
