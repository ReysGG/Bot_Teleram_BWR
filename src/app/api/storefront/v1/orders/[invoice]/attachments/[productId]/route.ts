import { NextResponse, type NextRequest } from "next/server";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import { requireWebCustomerSession, WebCustomerAccessError } from "@/server/storefront/customer-access";
import { storefrontAuthenticationResponse, storefrontBearerToken } from "@/server/storefront/http";
import { downloadWebProductAttachment } from "@/server/storefront/web-attachment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFilename(value: string) {
  return value.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "panduan-produk.bin";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ invoice: string; productId: string }> }) {
  const authentication = authenticateStorefrontRequest(request);
  if (!authentication.ok) return storefrontAuthenticationResponse(authentication);
  try {
    const session = await requireWebCustomerSession(storefrontBearerToken(request));
    const { invoice, productId } = await params;
    const attachment = await downloadWebProductAttachment({ customerId: session.webCustomerId, invoiceNumber: invoice, productId });
    if (!attachment) return NextResponse.json({ ok: false, code: "attachment_not_found" }, { status: 404 });
    const filename = safeFilename(attachment.filename);
    return new NextResponse(new Uint8Array(attachment.content), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": attachment.contentType,
        "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, code: error instanceof WebCustomerAccessError ? "session_invalid" : "attachment_unavailable" }, { status: error instanceof WebCustomerAccessError ? 401 : 503 });
  }
}
