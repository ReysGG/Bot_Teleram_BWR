// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

import { StockUploadForm } from "@/components/admin/stock-upload-form";

function click(element: Element) {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("admin stock upload form", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    routerMocks.push.mockReset();
    routerMocks.refresh.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows a portalled processing modal and keeps selected files after failure", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }));
    await act(async () => {
      root.render(createElement(StockUploadForm, {
        product: { id: "product-1", name: "ChatGPT K12" },
        returnTo: "/admin/products/product-1/edit",
      }));
    });

    const form = container.querySelector("form") as HTMLFormElement;
    const input = form.elements.namedItem("files") as HTMLInputElement;
    const file = new File([JSON.stringify({ email: "buyer@example.test" })], "stock.json", {
      type: "application/json",
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    await act(async () => {
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(document.body.textContent).toContain("Masukkan stok ke gudang?");

    await act(async () => {
      click([...document.body.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Ya, upload stok"))!);
      await Promise.resolve();
    });

    expect(document.body.querySelector(".admin-processing-card")).toBeTruthy();
    expect(document.body.querySelector(".product-stock-intake .admin-processing-card")).toBeNull();
    expect(document.body.textContent).toContain("Stok sedang diproses");
    expect(input.files?.[0]).toBe(file);

    await act(async () => {
      resolveRequest?.(new Response(JSON.stringify({
        ok: false,
        error: "stock-duplicate",
      }), {
        status: 422,
        headers: { "content-type": "application/json" },
      }));
      await Promise.resolve();
    });

    expect(document.body.querySelector(".admin-processing-card")).toBeNull();
    const resultModal = document.body.querySelector(".result-modal") as HTMLElement;
    expect(resultModal).toBeTruthy();
    expect(resultModal.querySelector('[role="alert"]')?.textContent)
      .toContain("sudah tersimpan di gudang");
    expect(input.files?.[0]).toBe(file);
    expect(container.textContent).toContain("1 file");
    expect(routerMocks.push).not.toHaveBeenCalled();
  });

  it("navigates only after the server confirms a successful upload", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      redirectTo: "/admin/products/product-1/edit?notice=stock-uploaded&imported=1",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await act(async () => {
      root.render(createElement(StockUploadForm, {
        product: { id: "product-1", name: "ChatGPT K12" },
      }));
    });
    const form = container.querySelector("form") as HTMLFormElement;
    const input = form.elements.namedItem("files") as HTMLInputElement;
    const transfer = new DataTransfer();
    transfer.items.add(new File(["credential"], "stock.txt", { type: "text/plain" }));
    await act(async () => {
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      click([...document.body.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Ya, upload stok"))!);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(routerMocks.push).toHaveBeenCalledWith(
      "/admin/products/product-1/edit?notice=stock-uploaded&imported=1",
    );
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("accepts textarea-only stock and keeps the pasted lines after failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: false,
      error: "stock-upload",
    }), {
      status: 500,
      headers: { "content-type": "application/json" },
    }));
    await act(async () => {
      root.render(createElement(StockUploadForm, {
        product: { id: "product-1", name: "Token bundle" },
      }));
    });

    const form = container.querySelector("form") as HTMLFormElement;
    const textarea = form.elements.namedItem("stockLines") as HTMLTextAreaElement;
    const pasted = "TOKEN-ONE\n\nTOKEN-TWO\nTOKEN-ONE";
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(textarea, pasted);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).toContain("2 baris unik siap diproses");
    const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(document.body.textContent).toContain("2 baris");
    await act(async () => {
      click([...document.body.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Ya, upload stok"))!);
      await Promise.resolve();
    });

    const requestOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((requestOptions.body as FormData).get("stockLines")).toBe(pasted);
    expect(textarea.value).toBe(pasted);
    expect(routerMocks.push).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("teks stok tetap tersedia");
  });
});
