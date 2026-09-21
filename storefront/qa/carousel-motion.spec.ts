import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("@/components/catalog/product-card", () => ({ ProductCard: ({ product }: { product: { name: string } }) => createElement("article", null, product.name) }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
import { ProductCarousel } from "../src/components/catalog/product-carousel";
import type { StorefrontProduct } from "../src/lib/catalog-types";
it("slides smoothly and pauses for pointer interaction and reduced motion", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.useFakeTimers();
  let reduced = false;
  vi.spyOn(window, "matchMedia").mockImplementation(() => ({ get matches() { return reduced; } }) as MediaQueryList);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(ProductCarousel, { title: "Populer", products: Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Product ${i}` }) as StorefrontProduct) })));
    const viewport = host.querySelector<HTMLDivElement>(".product-carousel")!;
    Object.defineProperties(viewport, { clientWidth: { value: 800 }, scrollWidth: { value: 3000 } });
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ top: 20, bottom: 400 } as DOMRect);
    const scroll = vi.spyOn(viewport, "scrollBy").mockImplementation(() => undefined);
    await act(async () => vi.advanceTimersByTime(4500));
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    scroll.mockClear();
    await act(async () => viewport.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    await act(async () => vi.advanceTimersByTime(4500)); expect(scroll).not.toHaveBeenCalled();
    await act(async () => viewport.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
    reduced = true;
    await act(async () => vi.advanceTimersByTime(4500)); expect(scroll).not.toHaveBeenCalled();
    expect(host.querySelectorAll("article")).toHaveLength(10);
  } finally { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});
