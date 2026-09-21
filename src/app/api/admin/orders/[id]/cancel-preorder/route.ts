import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import { cancelPaidPreorder } from "@/server/preorder/cancel";
import {
  assertAdminOrigin,
  requireAdminRequest,
} from "@/server/security/admin-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const reason = z.string().trim().min(3).max(500).parse(form.get("reason"));
    await cancelPaidPreorder({
      orderId: id,
      actor: `admin:${admin.email}`,
      reason,
    });
    return NextResponse.redirect(
      appRoute(`/admin/orders/${id}?notice=preorder-cancelled`),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(`/admin/orders/${id}?error=preorder-cancel`),
      303,
    );
  }
}
