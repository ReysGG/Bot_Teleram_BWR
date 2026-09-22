import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest, assertAdminOrigin } from "@/server/security/admin-auth";
import { reviewSellerDraft } from "@/server/seller/products";
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  try{
    assertAdminOrigin(request);const actor=requireAdminRequest(request); const {id}=await context.params;
    const f=await request.formData(); const decision=f.get("decision"), revision=Number(f.get("revision"));
    if(!["approve","reject"].includes(String(decision))||!Number.isSafeInteger(revision)||revision<1)throw new Error("invalid_input");
    await reviewSellerDraft(id,revision,decision as "approve"|"reject",actor.email,String(f.get("reason")??""));
    return NextResponse.redirect(new URL("/admin/seller-products/reviews?notice=reviewed",request.url),303);
  }catch{return NextResponse.redirect(new URL("/admin/seller-products/reviews?error=review_failed",request.url),303);}
}
