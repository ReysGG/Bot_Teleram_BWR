import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import { assignStockToPaidPreorder } from "@/server/preorder/assign-stock";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    const stockItemId = z.string().min(1).parse(form.get("stockItemId"));
    const result = await assignStockToPaidPreorder({ orderId: id, stockItemId });
    return NextResponse.redirect(
      appRoute(
        `/admin/orders/${id}?notice=stock-assigned&remaining=${result.remaining}`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(`/admin/orders/${id}?error=stock-assignment`),
      303,
    );
  }
}
