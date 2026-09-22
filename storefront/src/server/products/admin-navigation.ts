import type { ProductStatus } from "@/generated/prisma/enums";
import { buildAdminReturnPath, normalizeAdminReturnPath } from "@/server/admin/return-path";

const productListQueryKeys = new Set(["q", "group", "sort", "dir", "page"]);
const productListFragments = new Set(["product-list"]);

export function resolveProductAdminReturnTo(value: FormDataEntryValue | null, productId: string) {
  const requested = typeof value === "string" ? value : "";
  const fallback = "/admin/products";
  const normalized = normalizeAdminReturnPath(requested, fallback);
  const url = new URL(normalized, "https://admin-product-return.invalid");
  const allowed = new Set([
    "/admin/products",
    "/admin/products/inactive",
    `/admin/products/${productId}/edit`,
  ]);
  if (!allowed.has(url.pathname)) return fallback;

  if (url.pathname.endsWith("/edit")) {
    return url.pathname;
  }

  const query: Record<string, string> = {};
  for (const [key, rawValue] of url.searchParams) {
    if (!productListQueryKeys.has(key)) continue;
    const cleaned = rawValue.trim().slice(0, 200);
    if (cleaned) query[key] = cleaned;
  }
  const fragment = productListFragments.has(url.hash.slice(1))
    ? url.hash.slice(1)
    : undefined;
  return buildAdminReturnPath({ pathname: url.pathname, query, fragment });
}

export function productStatusNotice(status: ProductStatus) {
  return status === "ACTIVE" ? "product-activated" : "product-deactivated";
}
