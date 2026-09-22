import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_FORM_RESPONSE_HEADER,
  ADMIN_FORM_RESPONSE_JSON,
  type AdminFormResponse,
} from "@/lib/admin-form-response";
import { appRoute } from "@/server/env";
import { normalizeAdminReturnPath } from "@/server/admin/return-path";

function wantsJsonResponse(request: NextRequest) {
  return request.headers.get(ADMIN_FORM_RESPONSE_HEADER) === ADMIN_FORM_RESPONSE_JSON;
}

export function adminFormSuccess(
  request: NextRequest,
  destination: string,
  status = 200,
) {
  const redirectTo = normalizeAdminReturnPath(destination);
  if (wantsJsonResponse(request)) {
    return NextResponse.json<AdminFormResponse>(
      { ok: true, redirectTo },
      { status },
    );
  }
  return NextResponse.redirect(appRoute(redirectTo), 303);
}

export function adminFormFailure(
  request: NextRequest,
  destination: string,
  error: string,
  status = 422,
) {
  const redirectTo = normalizeAdminReturnPath(destination);
  if (wantsJsonResponse(request)) {
    return NextResponse.json<AdminFormResponse>(
      { ok: false, error },
      { status },
    );
  }
  return NextResponse.redirect(appRoute(redirectTo), 303);
}
