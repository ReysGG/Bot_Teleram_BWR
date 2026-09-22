import { NextRequest, NextResponse } from "next/server";
import { requireActiveSeller } from "@/server/seller/access";
import { assertAdminOrigin } from "@/server/security/admin-auth";
import { createSellerDraft } from "@/server/seller/products";

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const seller = await requireActiveSeller();
    const body = await request.text();
    if (Buffer.byteLength(body) > 20000) return NextResponse.json({code:"body_too_large"},{status:413});
    const draft = await createSellerDraft(seller.id, JSON.parse(body));
    return NextResponse.json({ ok: true, id: draft.id }, { headers: { "cache-control":"private, no-store" } });
  } catch { return NextResponse.json({ ok:false, code:"draft_not_saved" },{status:400}); }
}
