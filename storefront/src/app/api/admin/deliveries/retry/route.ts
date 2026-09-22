import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { queueFailedDeliveryRetries } from "@/server/telegram/delivery-retry";

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    const deliveryIds = z.array(z.string().min(1)).min(1).max(25).parse(
      form.getAll("deliveryIds"),
    );
    const result = await queueFailedDeliveryRetries(deliveryIds);
    return NextResponse.redirect(
      appRoute(`/admin/deliveries?notice=retry-queued&queued=${result.queued}&skipped=${result.skipped}`),
      303,
    );
  } catch {
    return NextResponse.redirect(appRoute("/admin/deliveries?error=retry-blocked"), 303);
  }
}
