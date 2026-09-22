import { NextRequest, NextResponse } from "next/server";
import { requireActiveSeller } from "@/server/seller/access";
import { requestSellerWithdrawal } from "@/server/seller/finance";
import { assertAdminOrigin } from "@/server/security/admin-auth";
export async function POST(request: NextRequest) {
  try { assertAdminOrigin(request); const seller = await requireActiveSeller(); const body = await request.text(); if (Buffer.byteLength(body) > 8_000) return NextResponse.json({ ok:false, code:"body_too_large" }, { status:413 }); const result = await requestSellerWithdrawal(seller.id, JSON.parse(body)); return NextResponse.json({ ok:true, id:result.id }, { headers:{"cache-control":"private, no-store"} }); }
  catch (error) { const code=error instanceof Error?error.message:"withdrawal_unavailable"; const status=code.includes("insufficient")||code.includes("payout")?409:422; return NextResponse.json({ok:false,code},{status}); }
}
