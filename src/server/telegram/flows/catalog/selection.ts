export type CatalogNumberedProduct = {
  number: number;
  kind?: "PRODUCT";
  productId: string;
};

export type CatalogNumberedGroup = {
  number: number;
  kind: "GROUP";
  groupId: string;
};

export type CatalogNumberedItem = CatalogNumberedProduct | CatalogNumberedGroup;

export type PendingCatalogSelection = {
  messageId: number;
  page: number;
  searchQuery: string | null;
  items: CatalogNumberedItem[];
};

export type PendingGroupSelection = {
  messageId: number;
  groupId: string;
  page: number;
  catalogPage: number;
  searchQuery: string | null;
  items: CatalogNumberedProduct[];
};

const CATALOG_SELECTION_KIND = "CATALOG_SELECTION";
const GROUP_SELECTION_KIND = "GROUP_SELECTION";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function catalogProductNumber(
  page: number,
  pageSize: number,
  index: number,
) {
  return (Math.max(1, page) - 1) * pageSize + index + 1;
}

export function catalogSelectionPayload(input: PendingCatalogSelection) {
  return {
    kind: CATALOG_SELECTION_KIND,
    messageId: input.messageId,
    page: input.page,
    searchQuery: input.searchQuery,
    items: input.items,
  };
}

export function parseCatalogSelection(
  value: unknown,
): PendingCatalogSelection | null {
  if (
    !isObject(value) ||
    value.kind !== CATALOG_SELECTION_KIND ||
    !Number.isSafeInteger(value.messageId) ||
    !Number.isSafeInteger(value.page) ||
    Number(value.page) < 1 ||
    !Array.isArray(value.items) ||
    (value.searchQuery !== null && typeof value.searchQuery !== "string")
  ) {
    return null;
  }

  const items: CatalogNumberedItem[] = [];
  const seenNumbers = new Set<number>();
  for (const item of value.items) {
    if (
      !isObject(item) ||
      !Number.isSafeInteger(item.number) ||
      Number(item.number) < 1 ||
      seenNumbers.has(Number(item.number))
    ) {
      return null;
    }
    seenNumbers.add(Number(item.number));
    if (item.kind === "GROUP") {
      if (typeof item.groupId !== "string" || item.groupId.length === 0) {
        return null;
      }
      items.push({
        number: Number(item.number),
        kind: "GROUP",
        groupId: item.groupId,
      });
      continue;
    }
    // Existing sessions did not store a kind, so a product remains the
    // backwards-compatible default.
    if (
      (item.kind !== undefined && item.kind !== "PRODUCT") ||
      typeof item.productId !== "string" ||
      item.productId.length === 0
    ) {
      return null;
    }
    items.push({
      number: Number(item.number),
      productId: item.productId,
    });
  }

  if (items.length === 0) return null;
  return {
    messageId: Number(value.messageId),
    page: Number(value.page),
    searchQuery: value.searchQuery as string | null,
    items,
  };
}

export function selectedCatalogProduct(
  selection: PendingCatalogSelection,
  text: string,
) {
  if (!/^\d+$/.test(text)) return null;
  const number = Number.parseInt(text, 10);
  const selected = selection.items.find((item) => item.number === number);
  return selected && "productId" in selected ? selected : null;
}

export function selectedCatalogEntry(
  selection: PendingCatalogSelection,
  text: string,
) {
  if (!/^\d+$/.test(text)) return null;
  const number = Number.parseInt(text, 10);
  return selection.items.find((item) => item.number === number) ?? null;
}

export function groupSelectionPayload(input: PendingGroupSelection) {
  return {
    kind: GROUP_SELECTION_KIND,
    messageId: input.messageId,
    groupId: input.groupId,
    page: input.page,
    catalogPage: input.catalogPage,
    searchQuery: input.searchQuery,
    items: input.items,
  };
}

export function parseGroupSelection(value: unknown): PendingGroupSelection | null {
  if (
    !isObject(value) ||
    value.kind !== GROUP_SELECTION_KIND ||
    !Number.isSafeInteger(value.messageId) ||
    typeof value.groupId !== "string" ||
    value.groupId.length === 0 ||
    !Number.isSafeInteger(value.page) ||
    Number(value.page) < 1 ||
    !Number.isSafeInteger(value.catalogPage) ||
    Number(value.catalogPage) < 1 ||
    (value.searchQuery !== null && typeof value.searchQuery !== "string") ||
    !Array.isArray(value.items)
  ) {
    return null;
  }

  const items: CatalogNumberedProduct[] = [];
  const seenNumbers = new Set<number>();
  for (const item of value.items) {
    if (
      !isObject(item) ||
      !Number.isSafeInteger(item.number) ||
      Number(item.number) < 1 ||
      typeof item.productId !== "string" ||
      item.productId.length === 0 ||
      seenNumbers.has(Number(item.number))
    ) {
      return null;
    }
    seenNumbers.add(Number(item.number));
    items.push({ number: Number(item.number), productId: item.productId });
  }
  if (items.length === 0) return null;
  return {
    messageId: Number(value.messageId),
    groupId: value.groupId,
    page: Number(value.page),
    catalogPage: Number(value.catalogPage),
    searchQuery: value.searchQuery as string | null,
    items,
  };
}

export function selectedGroupProduct(
  selection: PendingGroupSelection,
  text: string,
) {
  if (!/^\d+$/.test(text)) return null;
  const number = Number.parseInt(text, 10);
  return selection.items.find((item) => item.number === number) ?? null;
}

export function catalogReturnCallback(input: {
  value: unknown;
  catalogSearchQuery?: string | null;
  productGroupId?: string | null;
}) {
  const groupSelection = parseGroupSelection(input.value);
  const catalogSelection = parseCatalogSelection(input.value);
  if (groupSelection && groupSelection.groupId === input.productGroupId) {
    return `group_page:${groupSelection.groupId}:${groupSelection.page}`;
  }
  if (input.catalogSearchQuery) {
    return `catalog_search_page:${catalogSelection?.page ?? groupSelection?.catalogPage ?? 1}`;
  }
  if (input.productGroupId) return `group:${input.productGroupId}`;
  return `catalog:${catalogSelection?.page ?? 1}`;
}
