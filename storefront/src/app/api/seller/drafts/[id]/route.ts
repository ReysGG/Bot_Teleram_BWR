import { NextRequest, NextResponse } from "next/server";
import { requireActiveSeller } from "@/server/seller/access";
import { assertAdminOrigin } from "@/server/security/admin-auth";
import { updateSellerDraft } from "@/server/seller/products";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertAdminOrigin(request);
    const seller = await requireActiveSeller();
    const { id } = await params;
    const raw = JSON.parse(await request.text()) as Record<string, unknown>;
    const revision = Number(raw.revision);
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("revision_invalid");
    const draft = await updateSellerDraft(seller.id, id, revision, raw);
    return NextResponse.json({ ok: true, id: draft.id });
  } catch (error) {
    return NextResponse.json({ ok: false, code: error instanceof Error ? error.message : "draft_not_saved" }, { status: 400 });
  }
}
