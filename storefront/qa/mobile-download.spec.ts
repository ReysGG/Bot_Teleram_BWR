import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { PrivateFileDownload, isAppleTouchDevice, privateDownloadName } from "../src/components/orders/private-file-download";
let host: HTMLDivElement; let root: Root;
const fetchMock = vi.fn(), share = vi.fn(), handedOff = vi.fn(), revoke = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone)" });
  Object.defineProperty(navigator, "share", { configurable: true, value: share.mockResolvedValue(undefined) });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  URL.createObjectURL = vi.fn(() => "blob:private-test"); URL.revokeObjectURL = revoke;
  fetchMock.mockResolvedValue({ ok: true, headers: new Headers({ "content-disposition": "attachment; filename*=UTF-8''produk.txt" }), blob: async () => new Blob(["SYNTHETIC ONLY\nhttps://example.test/claim"], { type: "application/octet-stream" }) });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(method: "GET" | "POST" = "GET") { await act(async () => root.render(createElement(PrivateFileDownload, { endpoint: "/api/orders/DEMO/deliveries/DEMO", filename: "fallback.txt", label: "Download", method, onHandedOff: handedOff }))); }
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((x) => x.textContent === text);
  expect(button).toBeTruthy(); await act(async () => button!.click());
}
it("prepares on iPhone then shares on a separate tap without refetching", async () => {
  await render(); await click("Download");
  expect(share).not.toHaveBeenCalled(); expect(handedOff).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Simpan ke File");
  expect(host.querySelector("textarea")?.value).toContain("SYNTHETIC ONLY");
  await click("Simpan / Bagikan");
  expect(share).toHaveBeenCalledOnce(); expect(fetchMock).toHaveBeenCalledOnce();
  const file = share.mock.calls[0][0].files[0]; expect(file.name).toBe("produk.txt"); expect(file.type).toBe("text/plain");
});
it("keeps the prepared file when sharing is cancelled", async () => {
  share.mockRejectedValue(new DOMException("Cancelled", "AbortError"));
  await render(); await click("Download"); await click("Simpan / Bagikan");
  expect(host.textContent).toContain("dibatalkan"); expect(host.querySelector('a[download]')).not.toBeNull(); expect(handedOff).not.toHaveBeenCalled();
});
it("provides visible download and text fallback when Web Share is unavailable", async () => {
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
  await render(); await click("Download");
  expect(host.textContent).not.toContain("Simpan / Bagikan atau");
  expect(host.querySelector('a[target="_blank"]')?.getAttribute("href")).toContain("/api/orders/DEMO");
  expect(host.querySelector("textarea")?.readOnly).toBe(true);
});
it("does not offer a GET fallback for POST-only login exports", async () => {
  await render("POST"); await click("Download");
  expect(fetchMock.mock.calls[0][1].method).toBe("POST"); expect(host.querySelector('a[target="_blank"]')).toBeNull();
});
it("retains the blob until the component is removed", async () => {
  await render(); await click("Download"); expect(revoke).not.toHaveBeenCalled();
  await act(async () => root.render(null)); expect(revoke).toHaveBeenCalledWith("blob:private-test");
});
it("does not expose a file on authentication failure", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 401 }); await render(); await click("Download");
  expect(host.textContent).toContain("masuk kembali"); expect(host.querySelector("textarea")).toBeNull(); expect(share).not.toHaveBeenCalled();
});
it("recognizes iPad desktop mode and preserves filename fallback", () => {
  expect(isAppleTouchDevice("Macintosh", "MacIntel", 5)).toBe(true);
  expect(isAppleTouchDevice("Macintosh", "MacIntel", 0)).toBe(false);
  expect(privateDownloadName("attachment; filename=\"safe.txt\"; filename*=UTF-8''%broken", "fallback.txt")).toBe("safe.txt");
});
