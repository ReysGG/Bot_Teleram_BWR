"use client";

import {
  ADMIN_FORM_RESPONSE_HEADER,
  ADMIN_FORM_RESPONSE_JSON,
  isAdminFormResponse,
  type AdminFormResponse,
} from "@/lib/admin-form-response";

export async function submitAdminForm(
  form: HTMLFormElement,
  fetchImpl: typeof fetch = fetch,
  allowedRedirectPrefixes = ["/admin"],
): Promise<AdminFormResponse> {
  const response = await fetchImpl(form.action, {
    method: form.method || "post",
    body: new FormData(form),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      [ADMIN_FORM_RESPONSE_HEADER]: ADMIN_FORM_RESPONSE_JSON,
    },
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: response.status === 401 ? "admin-session" : "invalid-response" };
  }

  if (!isAdminFormResponse(payload, allowedRedirectPrefixes)) {
    return { ok: false, error: response.status === 401 ? "admin-session" : "invalid-response" };
  }
  return payload;
}
