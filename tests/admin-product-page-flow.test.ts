// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
import { ProductEditForm } from "@/components/admin/product-edit-form";
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function mount() {
  await act(async () => root.render(createElement(ProductEditForm, { groups: [{ id: "g1", name: "ChatGPT", status: "ACTIVE" }], defaultGroupId: "g1" })));
  return host.querySelector("form")!;
}
it("opens the selected group for new variants and matches server price constraints", async () => {
  const form = await mount();
  expect(form.getAttribute("action")).toBe("/api/admin/products");
  expect(host.querySelector<HTMLSelectElement>('[name="groupId"]')!.value).toBe("g1");
  const variant = host.querySelector<HTMLInputElement>('[name="variantLabel"]')!;
  expect(variant.required).toBe(true);
  expect(variant.closest<HTMLElement>("[data-editor-tab]")!.hidden).toBe(true);
  expect(host.querySelector<HTMLInputElement>('[name="price"]')!.max).toBe("1000000000");
});
it("switches to the panel containing the first invalid field", async () => {
  await mount();
  const name = host.querySelector<HTMLInputElement>('[name="name"]')!;
  const tabs = host.querySelectorAll<HTMLButtonElement>('[aria-label="Bagian produk"] [role="tab"]');
  await act(async () => tabs[2].click());
  expect(name.closest<HTMLElement>("[data-editor-tab]")!.hidden).toBe(true);
  await act(async () => name.dispatchEvent(new Event("invalid", { cancelable: true })));
  expect(name.closest<HTMLElement>("[data-editor-tab]")!.hidden).toBe(false);
  expect(host.querySelector('[role="alert"]')!.textContent).toContain("Lengkapi kolom");
});

it("enables mandatory preorder inputs only when preorder is enabled", async () => {
  await mount();
  const toggle = host.querySelector<HTMLInputElement>('[name="preorderEnabled"]')!;
  const limit = host.querySelector<HTMLInputElement>('[name="preorderLimit"]')!;
  expect(limit.disabled).toBe(true);
  await act(async () => toggle.click());
  expect(limit.disabled).toBe(false); expect(limit.required).toBe(true);
  expect(host.querySelector(".product-editor-summary")!.textContent).toContain("Aktif");
});
it("warns before losing an edited draft and removes the guard on unmount", async () => {
  await mount();
  const name = host.querySelector<HTMLInputElement>('[name="name"]')!;
  await act(async () => { name.value = "Draft"; name.dispatchEvent(new Event("input", { bubbles: true })); });
  const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await act(async () => root.render(null));
  const clean = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
});
