const ADMIN_RETURN_ORIGIN = "https://admin-return.invalid";

type AdminReturnQueryValue = string | number | null | undefined;

export function buildAdminReturnPath({
  pathname,
  query = {},
  fragment,
}: {
  pathname: string;
  query?: Record<string, AdminReturnQueryValue>;
  fragment?: string;
}): string {
  const safePath = normalizeAdminReturnPath(pathname);
  const url = new URL(safePath, ADMIN_RETURN_ORIGIN);
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      url.searchParams.delete(key);
      return;
    }
    url.searchParams.set(key, String(value));
  });

  const normalizedFragment = fragment?.trim().replace(/^#/, "") ?? "";
  url.hash = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(normalizedFragment)
    ? normalizedFragment
    : "";
  return `${url.pathname}${url.search}${url.hash}`;
}

export function normalizeAdminReturnPath(
  value: string,
  fallback = "/admin",
): string {
  const trimmed = value.trim().slice(0, 1000);
  if (!trimmed || /[\r\n\\]/.test(trimmed)) return fallback;
  try {
    const url = new URL(trimmed, ADMIN_RETURN_ORIGIN);
    if (url.origin !== ADMIN_RETURN_ORIGIN) return fallback;
    if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function adminResultReturnPath(
  returnTo: string,
  key: "notice" | "error",
  value: string,
  fallback = "/admin",
): string {
  const safePath = normalizeAdminReturnPath(returnTo, fallback);
  const url = new URL(safePath, ADMIN_RETURN_ORIGIN);
  url.searchParams.delete(key === "notice" ? "error" : "notice");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}
