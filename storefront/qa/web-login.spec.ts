import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { OrderLogin } from "../src/components/orders/order-login";
import { DownloadDelivery } from "../src/components/orders/download-delivery";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
let root: Root;
let host: HTMLDivElement;
const fetchMock = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); router.refresh.mockReset();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("hides login retrieval for noneligible products", async () => {
  fetchMock.mockResolvedValue(Response.json({ eligible: 0, available: 0, missing: 0 }));
  await act(async () => root.render(createElement(OrderLogin, { invoiceNumber: "DEMO" })));
  expect(host.textContent).toBe("");
});
it("shows partial availability and downloads only on an explicit click", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ eligible: 2, available: 1, missing: 1 })).mockResolvedValueOnce(new Response("fixture-only"));
  await act(async () => root.render(createElement(OrderLogin, { invoiceNumber: "DEMO" })));
  expect(host.textContent).toContain("1 dari 2 akun tersedia");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  expect(host.textContent).toContain("File siap");
  expect(host.querySelector('a[href="https://t.me/davidboysaja"]')).not.toBeNull();
});
it("does not download failed responses and explains expired authentication", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ eligible: 1, available: 1, missing: 0 })).mockResolvedValueOnce(new Response(null, { status: 401 }));
  await act(async () => root.render(createElement(OrderLogin, { invoiceNumber: "DEMO" })));
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  expect(host.textContent).toContain("Silakan masuk kembali");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("refreshes ownership-dependent UI after a successful product download", async () => {
  fetchMock.mockResolvedValue(new Response("synthetic-product"));
  await act(async () => root.render(createElement(DownloadDelivery, { invoice: "DEMO", receipt: "r1", filename: "demo.txt" })));
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  expect(router.refresh).toHaveBeenCalledTimes(1);
});
