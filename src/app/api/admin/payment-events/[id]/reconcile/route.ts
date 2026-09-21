import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import {
  PaymentReconciliationError,
  reconcilePaymentEvent,
} from "@/server/payment/reconciliation";
import {
  assertAdminOrigin,
  requireAdminRequest,
} from "@/server/security/admin-auth";
import { adminResultReturnPath } from "@/server/admin/return-path";

const inputSchema = z.object({
  targetId: z.string().min(1).max(120),
  targetKind: z.enum(["order", "wallet_topup"]),
  reason: z.string().trim().min(3).max(500),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let eventId = "";
  let returnTo = "/admin/payments/reconciliation#reconciliation-ledger";
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    eventId = (await context.params).id;
    const formData = await request.formData();
    returnTo = String(formData.get("returnTo") ?? returnTo);
    const input = inputSchema.parse({
      targetId: formData.get("targetId"),
      targetKind: formData.get("targetKind"),
      reason: formData.get("reason"),
    });
    await reconcilePaymentEvent({
      eventId,
      targetId: input.targetId,
      targetKind: input.targetKind,
      adminEmail: admin.email,
      reason: input.reason,
    });
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "notice", "reconciled")),
      303,
    );
  } catch (error) {
    const code = error instanceof PaymentReconciliationError
      ? error.code
      : error instanceof z.ZodError
        ? "invalid_input"
        : "unknown";
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "error", code)),
      303,
    );
  }
}
