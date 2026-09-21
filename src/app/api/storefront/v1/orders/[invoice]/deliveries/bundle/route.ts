import { NextResponse, type NextRequest } from "next/server";
import {
  requireWebCustomerSession,
  WebCustomerAccessError,
} from "@/server/storefront/customer-access";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import {
  storefrontAuthenticationResponse,
  storefrontBearerToken,
} from "@/server/storefront/http";
import {
  downloadWebDeliveryBundle,
  WebDeliveryError,
} from "@/server/storefront/web-delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFilename(value: string) {
  return value.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "digital-product.bin";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoice: string }> },
) {
  const authentication = authenticateStorefrontRequest(request);
  if (!authentication.ok) return storefrontAuthenticationResponse(authentication);
  try {
    const session = await requireWebCustomerSession(storefrontBearerToken(request));
    const { invoice } = await params;
    const delivery = await downloadWebDeliveryBundle({
      customerId: session.webCustomerId,
      invoiceNumber: invoice,
    });
    const filename = safeFilename(delivery.filename);
    return new NextResponse(new Uint8Array(delivery.content), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const sessionError = error instanceof WebCustomerAccessError;
    const deliveryError = error instanceof WebDeliveryError;
    return NextResponse.json(
      {
        ok: false,
        code: sessionError
          ? "session_invalid"
          : deliveryError && error.code === "TOO_LARGE" ? "delivery_bundle_too_large"
          : deliveryError && error.code === "NOT_READY"
            ? "delivery_not_ready"
            : deliveryError
              ? "delivery_not_found"
              : "delivery_unavailable",
      },
      {
        status: sessionError ? 401 : deliveryError && error.code === "TOO_LARGE" ? 413 : deliveryError && error.code === "NOT_READY" ? 409 : deliveryError ? 404 : 503,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
}
