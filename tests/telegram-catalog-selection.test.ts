import { describe, expect, it } from "vitest";
import {
  catalogReturnCallback,
  catalogProductNumber,
  catalogSelectionPayload,
  groupSelectionPayload,
  parseCatalogSelection,
  parseGroupSelection,
  selectedCatalogEntry,
  selectedCatalogProduct,
  selectedGroupProduct,
} from "@/server/telegram/flows/catalog/selection";
import {
  isCatalogCallback,
  parseProductGroupCallback,
} from "@/server/telegram/flows/catalog/callbacks";

describe("Telegram numbered catalog selection", () => {
  it("uses stable absolute numbers across catalog pages", () => {
    expect(catalogProductNumber(1, 5, 0)).toBe(1);
    expect(catalogProductNumber(1, 5, 4)).toBe(5);
    expect(catalogProductNumber(2, 5, 0)).toBe(6);
    expect(catalogProductNumber(3, 5, 2)).toBe(13);
  });

  it("resolves only products from the catalog snapshot shown to the user", () => {
    const selection = parseCatalogSelection(
      catalogSelectionPayload({
        messageId: 44,
        page: 2,
        searchQuery: "ChatGPT",
        items: [
          { number: 6, productId: "chatgpt-team" },
          { number: 7, productId: "chatgpt-k12" },
        ],
      }),
    );

    expect(selection).not.toBeNull();
    expect(selectedCatalogProduct(selection!, "6")).toEqual({
      number: 6,
      productId: "chatgpt-team",
    });
    expect(selectedCatalogProduct(selection!, "1")).toBeNull();
    expect(selectedCatalogProduct(selection!, "ChatGPT")).toBeNull();
  });

  it("rejects malformed or ambiguous catalog session payloads", () => {
    expect(parseCatalogSelection({ kind: "CATALOG_SELECTION" })).toBeNull();
    expect(
      parseCatalogSelection({
        kind: "CATALOG_SELECTION",
        messageId: 44,
        page: 1,
        searchQuery: null,
        items: [
          { number: 1, productId: "first" },
          { number: 1, productId: "second" },
        ],
      }),
    ).toBeNull();
  });

  it("supports mixed product groups and standalone products", () => {
    const selection = parseCatalogSelection(
      catalogSelectionPayload({
        messageId: 51,
        page: 1,
        searchQuery: null,
        items: [
          { number: 1, kind: "GROUP", groupId: "chatgpt" },
          { number: 2, productId: "standalone" },
        ],
      }),
    );

    expect(selectedCatalogEntry(selection!, "1")).toEqual({
      number: 1,
      kind: "GROUP",
      groupId: "chatgpt",
    });
    expect(selectedCatalogProduct(selection!, "1")).toBeNull();
    expect(selectedCatalogProduct(selection!, "2")).toEqual({
      number: 2,
      productId: "standalone",
    });
  });

  it("stores a paginated group snapshot for safe number input and back navigation", () => {
    const selection = parseGroupSelection(
      groupSelectionPayload({
        messageId: 75,
        groupId: "chatgpt",
        page: 2,
        catalogPage: 3,
        searchQuery: "K12",
        items: [
          { number: 6, productId: "k12-json" },
          { number: 7, productId: "codex-free" },
        ],
      }),
    );

    expect(selection).toMatchObject({
      groupId: "chatgpt",
      page: 2,
      catalogPage: 3,
      searchQuery: "K12",
    });
    expect(selectedGroupProduct(selection!, "7")).toEqual({
      number: 7,
      productId: "codex-free",
    });
    expect(selectedGroupProduct(selection!, "1")).toBeNull();
  });

  it("restores the exact catalog or variant page after a nested buy flow", () => {
    const catalog = catalogSelectionPayload({
      messageId: 50,
      page: 4,
      searchQuery: "ChatGPT",
      items: [{ number: 16, productId: "standalone" }],
    });
    const group = groupSelectionPayload({
      messageId: 60,
      groupId: "chatgpt",
      page: 3,
      catalogPage: 4,
      searchQuery: "ChatGPT",
      items: [{ number: 11, productId: "k12" }],
    });

    expect(catalogReturnCallback({
      value: catalog,
      catalogSearchQuery: "ChatGPT",
      productGroupId: null,
    })).toBe("catalog_search_page:4");
    expect(catalogReturnCallback({
      value: group,
      catalogSearchQuery: "ChatGPT",
      productGroupId: "chatgpt",
    })).toBe("group_page:chatgpt:3");
  });
});

describe("Telegram product group callbacks", () => {
  it("parses first-page and paginated group callbacks", () => {
    expect(parseProductGroupCallback("group:group-id")).toEqual({
      groupId: "group-id",
      page: 1,
    });
    expect(parseProductGroupCallback("group_page:group-id:12")).toEqual({
      groupId: "group-id",
      page: 12,
    });
    expect(isCatalogCallback("group:group-id")).toBe(true);
    expect(isCatalogCallback("group_page:group-id:2")).toBe(true);
  });

  it("rejects malformed callbacks and stays within Telegram's 64-byte limit", () => {
    expect(parseProductGroupCallback("group:")).toBeNull();
    expect(parseProductGroupCallback("group_page:group-id:0")).toBeNull();
    expect(parseProductGroupCallback("group_page:group-id:nope")).toBeNull();
    expect(parseProductGroupCallback("group_page:group-id:2:extra")).toBeNull();

    const callback = `group_page:${"c".repeat(25)}:9999`;
    expect(Buffer.byteLength(callback, "utf8")).toBeLessThanOrEqual(64);
  });
});
