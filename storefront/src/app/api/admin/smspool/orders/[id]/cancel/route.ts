import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { cancelSmsPoolOrder, smsPoolConfigured } from "@/server/smspool/client";
import { cancelSmsPoolCustomerOrderByAdmin } from "@/server/smspool/customer-orders";
import { cleanError } from "@/server/utils/format";

const orderIdSchema = z.string().trim().min(4).max(100).regex(/^[A-Za-z0-9_-]+$/);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    if (!smsPoolConfigured()) {
      return NextResponse.redirect(appRoute("/admin/smspool?error=configuration"), 303);
    }
    const { id } = await params;
    const parsedId = orderIdSchema.parse(id);
    const customerOrder = await cancelSmsPoolCustomerOrderByAdmin(
      parsedId,
      admin.email,
    );
    if (customerOrder) {
      return NextResponse.redirect(appRoute("/admin/smspool?notice=customer-cancelled"), 303);
    }
    await cancelSmsPoolOrder(parsedId);
    return NextResponse.redirect(appRoute("/admin/smspool?notice=provider-cancelled"), 303);
  } catch (error) {
    console.warn("[SMSPool cancel]", cleanError(error));
    const code = error instanceof z.ZodError ? "invalid" : "provider";
    return NextResponse.redirect(appRoute(`/admin/smspool?error=${code}`), 303);
  }
}
