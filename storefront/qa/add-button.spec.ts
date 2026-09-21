import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AddToCartButton } from "../src/components/catalog/add-to-cart-button";
import type { StorefrontProduct } from "../src/lib/catalog-types";
const state = vi.hoisted(() => ({ pending: false, add: vi.fn<() => Promise<boolean>>() }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true }), useClerk: () => ({ openSignIn: vi.fn() }) }));
vi.mock("@/components/cart/cart-context", () => ({ useCart: () => ({ ...state, hydrated: true, retryRequired: false, error: null, errorCode: null }) }));
vi.mock("@/components/cart/cart-add-animation", () => ({ animateCartAddition: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
it("only shows loading on the clicked product, including when another cart operation is pending", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const p = { id: "one", slug: "one", name: "One", readyStock: 5, availability: "IN_STOCK", preorderEnabled: false } as StorefrontProduct;
  const view = () => createElement(Fragment, null, createElement(AddToCartButton, { product: p, compact: true }), createElement(AddToCartButton, { product: { ...p, id: "two" }, compact: true }));
  let finish!: (value: boolean) => void;
  state.add.mockImplementation(() => { state.pending = true; return new Promise(resolve => { finish = resolve; }); });
  try {
    await act(async () => root.render(view()));
    await act(async () => { host.querySelector("button")!.click(); root.render(view()); });
    const buttons = host.querySelectorAll("button");
    expect(buttons[0].textContent).toContain("Menambahkan...");
    expect(buttons[1].textContent).toBe("Tambah");
    expect(buttons[1].getAttribute("aria-busy")).toBe("false");
    await act(async () => { state.pending = false; finish(true); root.render(view()); });
    state.pending = true; // quantity update originating from the preview cart
    await act(async () => root.render(view()));
    expect([...host.querySelectorAll("button")].every(button => button.textContent === "Tambah")).toBe(true);
  } finally { await act(async () => root.unmount()); host.remove(); state.pending = false; }
});
