export const ADMIN_INVENTORY_PAGE_SIZE = 20;

export function parseAdminPage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function adminPagination(
  totalItems: number,
  requestedPage: number,
  pageSize = ADMIN_INVENTORY_PAGE_SIZE,
) {
  const totalPages = Math.max(1, Math.ceil(Math.max(totalItems, 0) / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}
