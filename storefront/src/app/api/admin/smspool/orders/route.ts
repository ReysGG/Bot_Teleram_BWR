import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { purchaseSmsPoolNumber, smsPoolConfigured } from "@/server/smspool/client";
import { cleanError } from "@/server/utils/format";

const orderSchema = z.object({
  country: z.string().trim().min(1).max(20),
  service: z.string().trim().min(1).max(30),
  pool: z.string().trim().max(20).optional(),
  maxPrice: z.string().trim().max(20).optional().refine(
    (value) => !value || (Number(value) >= 0.01 && Number(value) <= 100),
    "Invalid max price",
  ),
  pricingOption: z.enum(["0", "1"]),
  quantity: z.coerce.number().int().min(1).max(10),
});

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    if (!smsPoolConfigured()) {
      return NextResponse.redirect(appRoute("/admin/smspool?error=configuration"), 303);
    }
    const form = await request.formData();
    const input = orderSchema.parse(Object.fromEntries(form));
    await purchaseSmsPoolNumber(input);
    return NextResponse.redirect(appRoute("/admin/smspool?notice=ordered"), 303);
  } catch (error) {
    console.warn("[SMSPool order]", cleanError(error));
    const code = error instanceof z.ZodError ? "invalid" : "provider";
    return NextResponse.redirect(appRoute(`/admin/smspool?error=${code}`), 303);
  }
}
