import { NextResponse, type NextRequest } from "next/server";
import { requireAdminRequest, assertAdminOrigin } from "@/server/security/admin-auth";
import { sensitiveDownloadHeaders } from "@/server/files/download";
import { AdminTakeoutError, downloadAdminStock } from "@/server/stock/admin-takeout";

export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { requireAdminRequest(request); assertAdminOrigin(request); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }
  try {
    const form = await request.formData();
    const mode = String(form.get("mode"));
    if (!["account", "email", "bundle"].includes(mode)) return NextResponse.json({ error: "invalid-mode" }, { status: 400 });
    const { id } = await params;
    const result = await downloadAdminStock(id, mode as "account" | "email" | "bundle", form.get("archive") === "true");
    try { return new NextResponse(Uint8Array.from(result.file), { headers: sensitiveDownloadHeaders({ filename: result.filename, contentLength: result.file.length }) }); }
    finally { result.file.fill(0); }
  } catch (error) {
    return NextResponse.json({ error: error instanceof AdminTakeoutError ? error.message : "file-unavailable" }, { status: error instanceof AdminTakeoutError ? 409 : 500, headers: { "Cache-Control": "no-store" } });
  }
}
