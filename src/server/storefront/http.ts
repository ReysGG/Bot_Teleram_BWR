import { NextResponse, type NextRequest } from "next/server";
import {
  authenticateStorefrontRequest,
  type StorefrontAuthenticationResult,
} from "@/server/storefront/auth";

export function storefrontAuthenticationResponse(
  authentication: Exclude<StorefrontAuthenticationResult, { ok: true }>,
) {
  return NextResponse.json(
    {
      ok: false,
      code: authentication.code === "CONFIGURATION"
        ? "unavailable"
        : authentication.code === "REPLAY"
          ? "replayed_request"
          : "unauthorized",
    },
    {
      status: authentication.status,
      headers: { "cache-control": "private, no-store" },
    },
  );
}

export async function authenticateStorefrontJsonRequest(
  request: NextRequest,
  maximumBytes = 4_096,
) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, code: "payload_too_large" },
        { status: 413, headers: { "cache-control": "private, no-store" } },
      ),
    };
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > maximumBytes) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, code: "payload_too_large" },
        { status: 413, headers: { "cache-control": "private, no-store" } },
      ),
    };
  }
  const authentication = authenticateStorefrontRequest(request, rawBody);
  if (!authentication.ok) {
    return {
      ok: false as const,
      response: storefrontAuthenticationResponse(authentication),
    };
  }
  try {
    return {
      ok: true as const,
      authentication,
      body: JSON.parse(rawBody) as unknown,
    };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, code: "invalid_json" },
        { status: 400, headers: { "cache-control": "private, no-store" } },
      ),
    };
  }
}

export function storefrontBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
}
