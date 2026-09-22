import { NextRequest, NextResponse } from "next/server";
import { requireActiveSeller } from "@/server/seller/access";
import { assertAdminOrigin } from "@/server/security/admin-auth";
import { submitSellerDraft } from "@/server/seller/products";
export async function POST(request:NextRequest, context:{params:Promise<{id:string}>}) {
  const {id} = await context.params;
  try {
    assertAdminOrigin(request); const seller = await requireActiveSeller();
    const form = await request.formData(); const revision=Number(form.get("revision"));
    if(!Number.isSafeInteger(revision)||revision<1)throw new Error("revision_invalid");
    await submitSellerDraft(seller.id,id,revision);
    return NextResponse.redirect(new URL("/seller/products?notice=submitted",request.url),303);
  } catch { return NextResponse.redirect(new URL("/seller/products?error=submit_failed",request.url),303); }
}
