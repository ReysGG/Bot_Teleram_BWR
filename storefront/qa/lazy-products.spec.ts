import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/components/catalog/product-card", () => ({ ProductCard: ({ product }: { product: { name: string } }) => createElement("article", null, product.name) }));
import { LazyProductGrid } from "../src/components/catalog/lazy-product-grid";
import type { StorefrontProduct } from "../src/lib/catalog-types";
let host: HTMLDivElement; let root: Root; let intersect: (entries: { isIntersecting: boolean }[]) => void;
const products = Array.from({ length: 13 }, (_, index) => ({ id: `p${index}`, name: `Product ${index}` }) as StorefrontProduct);
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("IntersectionObserver", class { constructor(callback: typeof intersect) { intersect = callback; } observe() {} disconnect() {} });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const view = () => createElement(LazyProductGrid, { initialProducts: products.slice(0, 12), orderedIds: products.map(product => product.id) });
it("loads the next batch only near the sentinel and deduplicates overlapping triggers", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(view()));
  expect(host.querySelectorAll("article")).toHaveLength(12); expect(fetcher).not.toHaveBeenCalled();
  await act(async () => { intersect([{ isIntersecting: true }]); intersect([{ isIntersecting: true }]); });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => finish(Response.json({ products: [products[12]] })));
  expect(host.querySelectorAll("article")).toHaveLength(13); expect(host.textContent).toContain("Semua produk");
});
it("retains loaded products and supports an explicit retry after a network error", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json({ products: [products[12]] })); vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(view())); await act(async () => intersect([{ isIntersecting: true }]));
  expect(host.querySelectorAll("article")).toHaveLength(12); expect(host.textContent).toContain("Coba lagi");
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  expect(host.querySelectorAll("article")).toHaveLength(13);
});
