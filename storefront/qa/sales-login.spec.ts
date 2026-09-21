import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ loaded: true, signedIn: false, path: "/shop" }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: state.loaded, isSignedIn: state.signedIn }) }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
import { LoginFeedback } from "../src/components/auth/login-feedback";
import { ProductSales } from "../src/components/catalog/product-sales";
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.useFakeTimers(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.loaded = true; state.signedIn = false; state.path = "/shop"; sessionStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });
async function render() { await act(async () => root.render(createElement(StrictMode, null, createElement(LoginFeedback)))); await act(async () => vi.advanceTimersByTime(1)); }
it("shows a check after login, survives route changes and disappears without navigating", async () => {
  state.path = "/sign-in"; await render(); expect(host.textContent).toBe("");
  state.signedIn = true; await render(); expect(host.textContent).toContain("Berhasil masuk");
  state.path = "/orders"; await render(); expect(host.textContent).toContain("Berhasil masuk");
  await act(async () => vi.advanceTimersByTime(1500)); expect(host.textContent).toBe("");
  expect(sessionStorage.getItem("bwr-login-feedback")).toBeNull();
});
it("shows registration success after a hard redirect and works in StrictMode", async () => {
  state.signedIn = true;
  sessionStorage.setItem("bwr-login-feedback", JSON.stringify({ at: Date.now(), mode: "register" }));
  await render(); expect(host.textContent).toContain("Akun berhasil dibuat");
});
it("does not celebrate a normal already-signed-in page load", async () => {
  state.signedIn = true; await render(); expect(host.textContent).toBe("");
});
it("ignores stale presentation markers", async () => {
  state.signedIn = true;
  sessionStorage.setItem("bwr-login-feedback", JSON.stringify({ at: Date.now() - 3600000, mode: "register" }));
  await render(); expect(host.textContent).toBe("");
});
it("fills the auth loading gap before Clerk is ready", async () => {
  state.path = "/sign-up"; state.loaded = false; await render(); expect(host.textContent).toContain("Menyiapkan akun");
});
it("shows exact sold units while keeping unknown data distinct from zero", () => {
  expect(renderToStaticMarkup(createElement(ProductSales, { count: 1234 }))).toContain("1.234 terjual");
  expect(renderToStaticMarkup(createElement(ProductSales, { count: 0 }))).toContain("0 terjual");
  expect(renderToStaticMarkup(createElement(ProductSales, {}))).toBe("");
});
