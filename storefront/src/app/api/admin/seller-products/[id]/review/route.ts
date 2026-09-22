import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest, assertAdminOrigin } from "@/server/security/admin-auth";
import { reviewSellerDraft } from "@/server/seller/products";
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;
  const redirectTo = (code: string) => NextResponse.redirect(new URL(`/admin/seller-products/reviews/${encodeURIComponent(id)}?error=${encodeURIComponent(code)}`,request.url),303);
  try{
    assertAdminOrigin(request);const actor=requireAdminRequest(request);
    const f=await request.formData(); const decision=f.get("decision"), revision=Number(f.get("revision"));
    if(!["approve","reject"].includes(String(decision))||!Number.isSafeInteger(revision)||revision<1)throw new Error("invalid_input");
    await reviewSellerDraft(id,revision,decision as "approve"|"reject",actor.email,String(f.get("reason")??""));
    return NextResponse.redirect(new URL(`/admin/seller-products/reviews/${encodeURIComponent(id)}?notice=reviewed`,request.url),303);
  }catch(error){
    const known = ["invalid_input","draft_changed","review_reason_required","seller_access_required","INVALID_ORIGIN","UNAUTHORIZED"];
    const code = error instanceof Error && known.includes(error.message) ? error.message.toLowerCase() : "review_failed";
    return redirectTo(code);
  }
}
