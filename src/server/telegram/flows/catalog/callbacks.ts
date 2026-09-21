export function isCatalogCallback(data: string) {
  return (
    data === "catalog" ||
    data.startsWith("catalog:") ||
    data === "catalog_search" ||
    data.startsWith("catalog_search_page:") ||
    data.startsWith("group:") ||
    data.startsWith("group_page:")
  );
}

export function parseProductGroupCallback(data: string) {
  if (data.startsWith("group:")) {
    const groupId = data.slice("group:".length);
    return groupId ? { groupId, page: 1 } : null;
  }
  if (!data.startsWith("group_page:")) return null;
  const [groupId, rawPage, ...extra] = data.slice("group_page:".length).split(":");
  if (!groupId || !rawPage || extra.length > 0 || !/^\d+$/.test(rawPage)) return null;
  const page = Number.parseInt(rawPage, 10);
  return page > 0 ? { groupId, page } : null;
}
