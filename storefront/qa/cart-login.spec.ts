import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ready: true, hasItem: false, signed: false, userId: "owner", open: vi.fn(), getToken: vi.fn(), signOut: vi.fn(), revision: 2, router: { refresh: vi.fn() } }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: mocks.ready, isSignedIn: mocks.signed, userId: mocks.signed ? mocks.userId : null, getToken: mocks.getToken }), useClerk: () => ({ openSignIn: mocks.open, signOut: mocks.signOut }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/products/demo", useRouter: () => mocks.router }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => createElement("a", { href }, children) }));
vi.mock("@/lib/load-account-cart", () => ({ loadAccountCart: async () => ({ ok: true, cart: { revision: mocks.revision, items: mocks.hasItem ? [{ id: "p1", quantity: 1, price: 500, canCheckout: true }] : [] } }) }));
vi.mock("@/components/cart/cart-add-animation", () => ({ animateCartAddition: vi.fn() }));
import { CartProvider, useCart } from "../src/components/cart/cart-context";
import { AddToCartButton } from "../src/components/catalog/add-to-cart-button";
import { ResumeCartAddition } from "../src/components/cart/resume-cart-addition";
import { beginCartIntent, readCartIntent, saveCartIntent } from "../src/lib/pending-cart-intent";
import type { StorefrontProduct } from "../src/lib/catalog-types";
const product = { id: "p1", slug: "demo", name: "Demo", price: 500, availability: "IN_STOCK", readyStock: 4, preorderEnabled: false } as StorefrontProduct;
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.ready = true; mocks.hasItem = false; mocks.signed = false; mocks.userId = "owner"; mocks.revision = 2; mocks.open.mockReset(); mocks.getToken.mockReset().mockResolvedValue("header.payload.signature"); mocks.signOut.mockReset().mockResolvedValue(undefined); sessionStorage.clear();
  history.replaceState(null, "", "/products/demo");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function settle() { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
function view(resume = false) { return createElement(StrictMode, null, createElement(CartProvider, null, resume ? createElement(ResumeCartAddition, { product }) : createElement(AddToCartButton, { product, compact: true }))); }
it("keeps Tambah for guests and configures both login and registration to return to the chosen product", async () => {
  await act(async () => root.render(view()));
  expect(host.querySelector("button")?.textContent).toBe("Tambah");
  await act(async () => host.querySelector("button")!.click());
  const props = mocks.open.mock.calls[0][0];
  expect(props.forceRedirectUrl).toMatch(/^\/products\/demo\?cart_intent=/);
  expect(props.signUpForceRedirectUrl).toBe(props.forceRedirectUrl);
  expect(readCartIntent(new URL(props.forceRedirectUrl, location.origin).searchParams.get("cart_intent")!, product.id)?.quantity).toBe(1);
});
it("resumes once in StrictMode and does not add again after a reload", async () => {
  history.replaceState(null, "", beginCartIntent(product)); mocks.signed = true;
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, cart: { revision: 3, items: [] } })); vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(view(true))); await settle();
  expect(fetcher).toHaveBeenCalledTimes(1); expect(host.textContent).toContain("sudah ditambahkan");
  await act(async () => root.render(null)); await act(async () => root.render(view(true))); await settle();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("replays the exact persisted command after an ambiguous network result", async () => {
  history.replaceState(null, "", beginCartIntent(product)); mocks.signed = true;
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce(Response.json({ ok: true, cart: { revision: 3, items: [] } })); vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(view(true))); await settle();
  await act(async () => root.render(null)); mocks.revision = 3;
  await act(async () => root.render(view(true))); await settle();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
});
it("rejects expired, different-product and different-owner intents", async () => {
  const target = beginCartIntent(product); const id = new URL(target, location.origin).searchParams.get("cart_intent")!;
  const intent = readCartIntent(id, product.id)!;
  expect(readCartIntent(id, "someone-else")).toBeNull();
  saveCartIntent({ ...intent, createdAt: Date.now() - 3600001 }); expect(readCartIntent(id, product.id)).toBeNull();
  saveCartIntent({ ...intent, ownerId: "another-owner" }); history.replaceState(null, "", target); mocks.signed = true;
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(view(true))); await settle(); expect(fetcher).not.toHaveBeenCalled();
});

it("never reports an empty cart before authentication and stored items finish loading", async () => {
  const observed: string[] = [];
  function Probe() { const cart = useCart(); const text = cart.hydrated ? `items:${cart.items.length}` : "loading"; observed.push(text); return createElement("span", null, text); }
  mocks.ready = false; mocks.signed = true; mocks.hasItem = true;
  await act(async () => root.render(createElement(CartProvider, null, createElement(Probe))));
  expect(host.textContent).toBe("loading");
  mocks.ready = true;
  await act(async () => root.render(createElement(CartProvider, null, createElement(Probe))));
  await settle();
  expect(host.textContent).toBe("items:1"); expect(observed).not.toContain("items:0");
});
