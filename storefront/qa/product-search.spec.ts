import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recommendProducts, typoDistance, type ProductSearchEntry } from "../src/lib/product-search";
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const entries: ProductSearchEntry[] = [
  { id: "gpt", slug: "gpt-plus", name: "ChatGPT Plus", price: 50000, availability: "IN_STOCK", featured: true, category: "AI", tags: "coding", variant: "", keywords: "asisten kerja" },
  { id: "mail", slug: "mail", name: "Outlook Mail", price: 500, availability: "IN_STOCK", featured: false, category: "Email", tags: "", variant: "", keywords: "chatgpt plus pendamping" },
];
beforeEach(() => { vi.resetModules(); router.push.mockReset(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("prioritizes title matches, handles typos/spacing and rejects unrelated or incomplete token matches", () => {
  expect(recommendProducts(entries, "chat gpt plus")[0].id).toBe("gpt");
  expect(recommendProducts(entries, "chatgtp")[0].id).toBe("gpt");
  expect(typoDistance("chatgtp", "chatgpt", 1)).toBe(1);
  expect(recommendProducts(entries, "zzzzzzzz")).toEqual([]);
  expect(recommendProducts(entries, "chatgpt zzzzzzzz")).toEqual([]);
  expect(recommendProducts(entries, "coding")[0].id).toBe("gpt");
});
it("coalesces simultaneous index loads and reuses the cached public index", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ products: entries })); vi.stubGlobal("fetch", fetcher);
  const { loadSearchIndex } = await import("../src/lib/search-index-client");
  const result = await Promise.all([loadSearchIndex(), loadSearchIndex(), loadSearchIndex()]);
  expect(result[0]).toHaveLength(2); await loadSearchIndex(); expect(fetcher).toHaveBeenCalledTimes(1);
});
it("backs off after failure instead of retrying on every focus", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch", fetcher);
  const { loadSearchIndex } = await import("../src/lib/search-index-client");
  await expect(loadSearchIndex()).rejects.toThrow(); await expect(loadSearchIndex()).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("filters locally while typing and navigates only when a recommendation is selected", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ products: entries })); vi.stubGlobal("fetch", fetcher);
  const { ProductSearchInput } = await import("../src/components/catalog/product-search-input");
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement("form", null, createElement(ProductSearchInput, { label: "Cari" }))));
    const input = host.querySelector("input")!;
    await act(async () => input.focus());
    for (const query of ["c", "ch", "chat", "chatgtp"]) await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, query);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(router.push).not.toHaveBeenCalled();
    expect(host.querySelector('[role="option"]')?.textContent).toContain("ChatGPT Plus");
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(router.push).toHaveBeenCalledWith("/products/gpt-plus");
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
