import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { OrderReveal, revealMode, type RevealOrder } from "../src/components/orders/order-reveal";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
let host: HTMLDivElement;
let root: Root;
let images: Array<{ onload: null | (() => void); onerror: null | (() => void); src: string }>;
let serial = 0;
let visibility: DocumentVisibilityState = "visible";
const ready = (): RevealOrder => ({ id: `reveal-test-${++serial}`, productName: "Produk contoh", status: "FULFILLING", paymentStatus: "PAID", deliveryState: "READY", quantity: 1, readyFiles: 1, deliveredFiles: 0 });
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); localStorage.clear(); mocks.refresh.mockReset(); images = [];
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.spyOn(window, "Image").mockImplementation(class {
    onload: null | (() => void) = null; onerror: null | (() => void) = null; src = "";
    constructor() { images.push(this); }
  } as unknown as typeof Image);
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
it("never celebrates unpaid, refunded, expired, already delivered or unready stock", () => {
  const order = ready();
  expect(revealMode({ ...order, paymentStatus: "PENDING" })).toBe("none");
  for (const status of ["PENDING_PAYMENT", "REFUNDED", "CANCELLED", "EXPIRED"]) expect(revealMode({ ...order, status })).toBe("none");
  expect(revealMode({ ...order, status: "PAID_WAITING_STOCK", readyFiles: 0 })).toBe("preorder");
  expect(revealMode({ ...order, quantity: 2 })).toBe("processing");
  expect(revealMode({ ...order, deliveryState: "DELIVERED", readyFiles: 0, deliveredFiles: 1 })).toBe("none");
});
it("plays six frames once, closes at two seconds, and does not replay on remount", async () => {
  const order = ready();
  await act(async () => root.render(createElement(OrderReveal, { order })));
  expect(host.querySelector("dialog")!.open).toBe(false);
  await act(async () => images[0].onload?.());
  expect(host.querySelector("dialog")!.open).toBe(true);
  await act(async () => vi.advanceTimersByTime(1400));
  expect(host.querySelector("dialog [data-frame]")?.getAttribute("data-frame")).toBe("5");
  await act(async () => vi.advanceTimersByTime(600));
  expect(host.querySelector("dialog")!.open).toBe(false);
  await act(async () => root.render(null));
  await act(async () => root.render(createElement(OrderReveal, { order })));
  expect(images).toHaveLength(1);
  expect(host.querySelector("dialog")!.open).toBe(false);
});
it("skip and Escape dismiss immediately, and leaving the page cancels timers", async () => {
  await act(async () => root.render(createElement(OrderReveal, { order: ready() })));
  await act(async () => images[0].onload?.());
  await act(async () => host.querySelector<HTMLButtonElement>(".order-reveal-skip")!.click());
  expect(host.querySelector("dialog")!.open).toBe(false);
  await act(async () => root.render(createElement(OrderReveal, { order: ready() })));
  await act(async () => images[1].onload?.());
  await act(async () => host.querySelector("dialog")!.dispatchEvent(new Event("cancel", { bubbles: true })));
  expect(host.querySelector("dialog")!.open).toBe(false);
  await act(async () => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
});
it("does not show an overlay when motion is reduced or artwork fails", async () => {
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  await act(async () => root.render(createElement(OrderReveal, { order: ready() })));
  expect(images).toHaveLength(0);
  expect(host.textContent).toContain("Produkmu siap!");
  vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
  await act(async () => root.render(createElement(OrderReveal, { order: ready() })));
  await act(async () => images[0].onerror?.());
  expect(host.querySelector("dialog")!.open).toBe(false);
});
it("holds processing and preorder without a success overlay, then responds to ready server data", async () => {
  const order = ready();
  await act(async () => root.render(createElement(OrderReveal, { order: { ...order, readyFiles: 0, deliveryState: "PROCESSING" } })));
  expect(host.querySelector("dialog")).toBeNull();
  expect(host.textContent).toContain("Menyiapkan produkmu");
  await act(async () => vi.advanceTimersByTime(4000));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  await act(async () => root.render(createElement(OrderReveal, { order })));
  await act(async () => images[0].onload?.());
  expect(host.querySelector("dialog")!.open).toBe(true);
  await act(async () => root.render(createElement(OrderReveal, { order: { ...order, status: "PAID_WAITING_STOCK", readyFiles: 0 } })));
  expect(host.querySelector("dialog")).toBeNull();
  expect(host.querySelector("[data-frame]")?.getAttribute("data-frame")).toBe("0");
});
it("does not poll hidden tabs or keep polling indefinitely", async () => {
  const order = { ...ready(), readyFiles: 0, deliveryState: "PROCESSING" as const };
  await act(async () => root.render(createElement(OrderReveal, { order })));
  visibility = "hidden";
  await act(async () => vi.advanceTimersByTime(4000));
  expect(mocks.refresh).not.toHaveBeenCalled();
  await act(async () => root.render(null));
  visibility = "visible";
  await act(async () => root.render(createElement(OrderReveal, { order: { ...order, id: "another-processing-order" } })));
  for (let i = 0; i < 12; i++) await act(async () => vi.advanceTimersByTime(4000));
  expect(mocks.refresh).toHaveBeenCalledTimes(10);
});
it("falls back to in-memory once-only tracking when browser storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  const order = ready();
  await act(async () => root.render(createElement(OrderReveal, { order })));
  await act(async () => images[0].onload?.());
  expect(host.querySelector("dialog")!.open).toBe(true);
  await act(async () => root.render(null));
  await act(async () => root.render(createElement(OrderReveal, { order })));
  expect(images).toHaveLength(1);
  expect(host.querySelector("dialog")!.open).toBe(false);
});
it("does not replay an old order whose product files were already downloaded", async () => {
  await act(async () => root.render(createElement(OrderReveal, { order: { ...ready(), quantity: 2, readyFiles: 1, deliveredFiles: 1 } })));
  expect(images).toHaveLength(0);
  expect(host.querySelector("dialog")!.open).toBe(false);
});
