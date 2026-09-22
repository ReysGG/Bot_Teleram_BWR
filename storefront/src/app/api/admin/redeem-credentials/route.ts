import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import {
  assertAdminOrigin,
  requireAdminRequest,
} from "@/server/security/admin-auth";
import {
  AccountLoginImportError,
  importAccountLoginFiles,
} from "@/server/redeem/account-login";
import { cleanError } from "@/server/utils/format";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let credentialFiles: Array<{ filename: string; content: Buffer }> = [];
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    credentialFiles = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        content: Buffer.from(await file.arrayBuffer()),
      })),
    );
    const result = await importAccountLoginFiles({
      importedBy: admin.email,
      files: credentialFiles,
    });
    const query = new URLSearchParams({
      notice: "uploaded",
      processed: String(result.processed),
      imported: String(result.imported),
      updated: String(result.updated),
      unchanged: String(result.unchanged),
      invalid: String(result.invalid),
      duplicates: String(result.duplicates),
      conflicts: String(result.conflicts),
    });
    return NextResponse.redirect(appRoute(`/admin/redeem?${query}`), 303);
  } catch (error) {
    console.warn("[Admin redeem credential upload]", cleanError(error));
    const code = error instanceof AccountLoginImportError ? error.code : "upload";
    return NextResponse.redirect(appRoute(`/admin/redeem?error=${code}`), 303);
  } finally {
    for (const file of credentialFiles) file.content.fill(0);
  }
}
