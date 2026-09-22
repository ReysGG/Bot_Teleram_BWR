import { NextResponse, type NextRequest } from "next/server";
import {
  isProductStockReturnPath,
  normalizeInventoryReturnUrl,
} from "@/server/admin/inventory";
import {
  adminResultReturnPath,
  buildAdminReturnPath,
} from "@/server/admin/return-path";
import { appRoute } from "@/server/env";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { checkStockItem } from "@/server/stock/health-check";
import {
  StockImportError,
  updateStockItem,
} from "@/server/stock/inventory";
import { cleanError } from "@/server/utils/format";

export const runtime = "nodejs";
export const maxDuration = 30;

function editRedirect(id: string, returnTo: string, error: string) {
  const query = new URLSearchParams({ returnTo, error });
  return NextResponse.redirect(
    appRoute(`/admin/inventory/${id}/edit?${query}`),
    303,
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let returnTo = "/admin/inventory/available";
  let plaintextContent: Buffer | undefined;

  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    returnTo = normalizeInventoryReturnUrl(
      String(form.get("returnTo") ?? ""),
      returnTo,
    );
    const replacementFile = form.get("replacementFile");
    const rawContent = form.get("rawContent");
    plaintextContent =
      replacementFile instanceof File && replacementFile.size > 0
        ? Buffer.from(await replacementFile.arrayBuffer())
        : typeof rawContent === "string"
          ? Buffer.from(rawContent, "utf8")
          : undefined;

    const updated = await updateStockItem({
      stockItemId: id,
      productId: String(form.get("productId") ?? ""),
      filename: String(form.get("filename") ?? ""),
      content: plaintextContent,
    });

    if (updated.archived) {
      const returnPath = returnTo.split(/[?#]/, 1)[0];
      const destination = isProductStockReturnPath(returnTo) || returnPath === "/admin/inventory/archived"
        ? returnTo
        : "/admin/inventory/archived#inventory-ledger";
      return NextResponse.redirect(
        appRoute(adminResultReturnPath(destination, "notice", "stock-edited")),
        303,
      );
    }

    try {
      const result = await checkStockItem(updated.id);
      const allocated = await allocatePaidPreorders(updated.productId);
      const returnPath = returnTo.split(/[?#]/, 1)[0];
      const targetPath = result.classification === "BANNED"
        ? "/admin/inventory/banned"
        : "/admin/inventory/available";
      const sameTarget = returnPath === targetPath || (
        result.classification === "BANNED" && returnPath === "/admin/inventory/banned-recovery"
      );
      const destination = isProductStockReturnPath(returnTo) || sameTarget
        ? returnTo
        : `${targetPath}#inventory-ledger`;
      const resultPath = adminResultReturnPath(
        destination,
        "notice",
        `stock-edited-${result.classification.toLowerCase()}`,
      );
      return NextResponse.redirect(appRoute(buildAdminReturnPath({
        pathname: resultPath,
        query: { allocated: String(allocated) },
        fragment: "inventory-ledger",
      })), 303);
    } catch (error) {
      console.warn("[Admin inventory edit post-check]", cleanError(error));
      const returnPath = returnTo.split(/[?#]/, 1)[0];
      const destination = isProductStockReturnPath(returnTo) || returnPath === "/admin/inventory/available"
        ? returnTo
        : "/admin/inventory/available#inventory-ledger";
      return NextResponse.redirect(
        appRoute(adminResultReturnPath(
          destination,
          "notice",
          "stock-edited-check-failed",
        )),
        303,
      );
    }
  } catch (error) {
    console.warn("[Admin inventory edit]", cleanError(error));
    const code = error instanceof StockImportError ? error.code : "stock-edit";
    return editRedirect(id, returnTo, code);
  } finally {
    plaintextContent?.fill(0);
  }
}
