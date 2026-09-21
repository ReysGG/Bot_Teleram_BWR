export type OrderPagination = { page: number; totalPages: number; total: number; totalOrders: number; pendingCount: number; pageSize: number; q: string; status: string };
export function ordersPageHref(input: { page?: number; q?: string; status?: string }) {
  const query = new URLSearchParams({ page: String(input.page ?? 1) });
  if (input.q) query.set("q", input.q);
  if (input.status && input.status !== "all") query.set("status", input.status);
  return "/orders?" + query.toString();
}
