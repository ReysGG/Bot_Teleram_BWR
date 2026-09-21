export const ADMIN_FORM_RESPONSE_HEADER = "x-admin-form-response";
export const ADMIN_FORM_RESPONSE_JSON = "json";

export type AdminFormResponse =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export function isAdminFormResponse(value: unknown): value is AdminFormResponse {
  if (!value || typeof value !== "object" || !("ok" in value)) return false;
  const response = value as Record<string, unknown>;
  if (response.ok === true) {
    return typeof response.redirectTo === "string"
      && response.redirectTo.startsWith("/admin");
  }
  return response.ok === false
    && typeof response.error === "string"
    && response.error.length > 0;
}
