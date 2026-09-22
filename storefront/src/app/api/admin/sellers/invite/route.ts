import { NextRequest, NextResponse } from "next/server";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { createLocalSellerInvitation } from "@/server/seller/invitations";
export async function POST(request: NextRequest) { try { assertAdminOrigin(request); const admin = requireAdminRequest(request); const result = await createLocalSellerInvitation(admin.email, JSON.parse(await request.text())); return NextResponse.json({ ok: true, invitePath: result.invitePath, expiresAt: result.expiresAt.toISOString() }, { headers: { "cache-control": "private, no-store" } }); } catch (error) { return NextResponse.json({ ok: false, code: error instanceof Error ? error.message : "invite_failed" }, { status: 400 }); } }
