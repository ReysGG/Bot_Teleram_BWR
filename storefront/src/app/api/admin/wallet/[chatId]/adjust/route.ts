import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import {
  assertAdminOrigin,
  requireAdminRequest,
} from "@/server/security/admin-auth";
import { adjustWalletBalance } from "@/server/wallet/ledger";
import { adminResultReturnPath } from "@/server/admin/return-path";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ chatId: string }> },
) {
  const { chatId } = await context.params;
  const redirectPath = `/admin/wallet/${encodeURIComponent(chatId)}`;
  let returnTo = redirectPath;
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    returnTo = String(form.get("returnTo") ?? redirectPath);
    const amount = Number.parseInt(String(form.get("amount") ?? ""), 10);
    const direction = String(form.get("direction") ?? "");
    const note = String(form.get("note") ?? "").trim();
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > 100_000_000 ||
      !["credit", "debit"].includes(direction) ||
      !note
    ) {
      throw new Error("Invalid wallet adjustment");
    }
    await adjustWalletBalance({
      chatId,
      amount: direction === "credit" ? amount : -amount,
      idempotencyKey: `admin-adjust:${randomUUID()}`,
      actor: `admin:${admin.email}`,
      note,
    });
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "notice", "adjusted", redirectPath)),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "error", "adjustment", redirectPath)),
      303,
    );
  }
}
