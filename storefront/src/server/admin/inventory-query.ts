import { Prisma } from "@/generated/prisma/client";
import { normalizeAdminSearch } from "@/server/admin/order-search";

export type InventoryDateField =
  | "createdAt"
  | "lastCheckedAt"
  | "deliveredAt"
  | "archivedAt";
export type InventorySort = "date" | "filename" | "product" | "lifecycle" | "health";
export type InventoryDirection = "asc" | "desc";

export type InventoryFilterParams = {
  q?: string;
  product?: string;
  lifecycle?: string;
  health?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
};

export type InventoryFilters = {
  search: string;
  productId: string;
  lifecycle: "AVAILABLE" | "RESERVED" | "DELIVERED" | "BANNED" | "DISABLED" | "";
  health: "UNKNOWN" | "HEALTHY" | "BANNED" | "ERROR" | "";
  dateFrom: string;
  dateTo: string;
  sort: InventorySort;
  direction: InventoryDirection;
};

const lifecycleValues = new Set(["AVAILABLE", "RESERVED", "DELIVERED", "BANNED", "DISABLED"]);
const healthValues = new Set(["UNKNOWN", "HEALTHY", "BANNED", "ERROR"]);
const sortValues = new Set<InventorySort>(["date", "filename", "product", "lifecycle", "health"]);

function normalizedDate(value: string | undefined): string {
  const date = value?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed) === date
    ? date
    : "";
}

export function parseInventoryFilters(params: InventoryFilterParams): InventoryFilters {
  const lifecycle = params.lifecycle?.trim().toUpperCase() ?? "";
  const health = params.health?.trim().toUpperCase() ?? "";
  const sort = params.sort as InventorySort | undefined;
  return {
    search: normalizeAdminSearch(params.q),
    productId: params.product?.trim().slice(0, 100) ?? "",
    lifecycle: lifecycleValues.has(lifecycle)
      ? lifecycle as InventoryFilters["lifecycle"]
      : "",
    health: healthValues.has(health) ? health as InventoryFilters["health"] : "",
    dateFrom: normalizedDate(params.from),
    dateTo: normalizedDate(params.to),
    sort: sort && sortValues.has(sort) ? sort : "date",
    direction: params.dir === "asc" ? "asc" : "desc",
  };
}

function jakartaDate(value: string, nextDay = false): Date {
  const date = new Date(`${value}T00:00:00+07:00`);
  if (nextDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export function inventoryFilterWhere(
  filters: InventoryFilters,
  dateField: InventoryDateField,
): Prisma.DigitalStockItemWhereInput {
  const dateFilter: Prisma.DateTimeNullableFilter = {
    ...(filters.dateFrom ? { gte: jakartaDate(filters.dateFrom) } : {}),
    ...(filters.dateTo ? { lt: jakartaDate(filters.dateTo, true) } : {}),
  };
  return {
    AND: [
      filters.productId ? { productId: filters.productId } : {},
      filters.lifecycle ? { status: filters.lifecycle } : {},
      filters.health ? { healthStatus: filters.health } : {},
      filters.dateFrom || filters.dateTo
        ? ({ [dateField]: dateFilter } as Prisma.DigitalStockItemWhereInput)
        : {},
    ],
  };
}

function dateOrderBy(
  field: InventoryDateField,
  direction: InventoryDirection,
): Prisma.DigitalStockItemOrderByWithRelationInput {
  if (field === "createdAt") return { createdAt: direction };
  return { [field]: { sort: direction, nulls: "last" } } as Prisma.DigitalStockItemOrderByWithRelationInput;
}

export function inventoryOrderBy(
  filters: InventoryFilters,
  dateField: InventoryDateField,
): Prisma.DigitalStockItemOrderByWithRelationInput[] {
  const selected: Prisma.DigitalStockItemOrderByWithRelationInput =
    filters.sort === "filename"
      ? { originalFilename: filters.direction }
      : filters.sort === "product"
        ? { product: { name: filters.direction } }
        : filters.sort === "lifecycle"
          ? { status: filters.direction }
          : filters.sort === "health"
            ? { healthStatus: filters.direction }
            : dateOrderBy(dateField, filters.direction);
  return [selected, { id: "asc" }];
}

export function inventoryFilterQuery(filters: InventoryFilters) {
  return {
    q: filters.search || undefined,
    product: filters.productId || undefined,
    lifecycle: filters.lifecycle || undefined,
    health: filters.health || undefined,
    from: filters.dateFrom || undefined,
    to: filters.dateTo || undefined,
    sort: filters.sort === "date" ? undefined : filters.sort,
    dir: filters.direction === "desc" ? undefined : filters.direction,
  };
}
