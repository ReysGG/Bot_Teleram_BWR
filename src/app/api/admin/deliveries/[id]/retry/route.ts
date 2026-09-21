import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { queueAcknowledgedMissingDeliveryRetry, queueFailedDeliveryRetry } from "@/server/telegram/delivery-retry";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    if (form.get("confirmUnknown") === "true") await queueAcknowledgedMissingDeliveryRetry(id);
    else await queueFailedDeliveryRetry(id);
    return NextResponse.redirect(appRoute(`/admin/deliveries/${id}?notice=retry-queued`), 303);
  } catch {
    return NextResponse.redirect(appRoute(`/admin/deliveries/${id}?error=retry-blocked`), 303);
  }
}
