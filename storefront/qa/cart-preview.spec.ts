import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CartPreview } from "../src/components/cart/cart-preview";

const state = vi.hoisted(() => ({ signedIn: true, hydrated: true, pending: false, retryRequired: false, setQuantity: vi.fn(async () => true), remove: vi.fn(async () => true), error: null as string | null, items: [{ id: "demo", slug: "demo", name: "Produk demo", price: 500, quantity: 2, maxQuantity: 3, imageUrl: null, canCheckout: true }] }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: state.signedIn }) }));
vi.mock("@/components/cart/cart-context", () => ({ useCart: () => ({ items: state.items, itemCount: 2, subtotal: 1000, hydrated: state.hydrated, pending: state.pending, retryRequired: state.retryRequired, setQuantity: state.setQuantity, remove: state.remove, error: state.error }) }));
vi.mock("@/components/catalog/product-artwork", () => ({ ProductArtwork: () => null }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => createElement("a", props, children) }));
let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.signedIn = true; state.hydrated = true; state.error = null; state.pending = false; state.retryRequired = false; state.items[0].quantity = 2; state.setQuantity.mockClear(); state.remove.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(CartPreview)));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });
const trigger = () => host.querySelector<HTMLButtonElement>(".header-cart")!;
const panel = () => host.querySelector(".cart-preview-panel");
it("opens on hover, preserves the preview on a mouse click, and closes on Escape", async () => {
  await act(async () => trigger().dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
  expect(panel()?.textContent).toContain("Produk demo");
  expect(panel()?.textContent).toContain("1.000");
  await act(async () => trigger().dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
  expect(panel()).not.toBeNull();
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(panel()).toBeNull(); expect(document.activeElement).toBe(trigger());
});
it("opens with touch/click and dismisses on an outside pointer", async () => {
  await act(async () => trigger().click());
  expect(panel()).not.toBeNull();
  await act(async () => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  expect(panel()).toBeNull();
});
it("does not expose the cart snapshot when signed out", async () => {
  state.signedIn = false;
  await act(async () => { root.render(createElement(CartPreview)); });
  await act(async () => trigger().click());
  expect(panel()?.textContent).toContain("Masuk untuk melihat keranjang");
  expect(panel()?.textContent).not.toContain("Produk demo");
});
it("shows loading or an error instead of presenting a failed load as an empty cart", async () => {
  state.hydrated = false;
  await act(async () => { root.render(createElement(CartPreview)); });
  await act(async () => trigger().click());
  expect(panel()?.textContent).toContain("Memuat keranjang");
  state.error = "Keranjang belum tersedia";
  await act(async () => root.render(createElement(CartPreview)));
  expect(panel()?.textContent).toContain(state.error);
  expect(panel()?.textContent).not.toContain("Produk demo");
});

it("updates quantities and removes through the existing cart actions without closing preview", async () => {
  await act(async () => trigger().click());
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Tambah Produk demo"]')!.click());
  expect(state.setQuantity).toHaveBeenLastCalledWith("demo", 3);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Kurangi Produk demo"]')!.click());
  expect(state.setQuantity).toHaveBeenLastCalledWith("demo", 1);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Hapus Produk demo"]')!.click());
  expect(state.remove).toHaveBeenCalledWith("demo");
  expect(panel()).not.toBeNull();
});
it("enforces quantity limits and blocks further mutations while pending or awaiting retry", async () => {
  await act(async () => trigger().click());
  state.items[0].quantity = 1;
  await act(async () => root.render(createElement(CartPreview)));
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Kurangi Produk demo"]')!.disabled).toBe(true);
  state.items[0].quantity = 3;
  await act(async () => root.render(createElement(CartPreview)));
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Tambah Produk demo"]')!.disabled).toBe(true);
  for (const mode of ["pending", "retryRequired"] as const) {
    state[mode] = true;
    await act(async () => root.render(createElement(CartPreview)));
    expect(Array.from(host.querySelectorAll<HTMLButtonElement>(".cart-preview-item-actions button")).every(button => button.disabled)).toBe(true);
    state[mode] = false;
  }
});
it("keeps the cart open when a quantity control loses focus while it is disabled for saving", async () => {
  vi.useFakeTimers();
  await act(async () => trigger().click());
  const decrease = host.querySelector<HTMLButtonElement>('[aria-label="Kurangi Produk demo"]')!;
  await act(async () => {
    decrease.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
    decrease.focus();
  });
  state.pending = true;
  await act(async () => root.render(createElement(CartPreview)));
  await act(async () => decrease.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null })));
  await act(async () => {
    host.querySelector(".cart-preview")!.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body }));
    vi.advanceTimersByTime(250);
  });
  expect(panel()).not.toBeNull();
  state.pending = false;
  await act(async () => root.render(createElement(CartPreview)));
  expect(panel()).not.toBeNull();
  await act(async () => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  expect(panel()).toBeNull();
});
