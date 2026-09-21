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

import { ProductFormModal } from "@/components/admin/product-form-modal";

function click(element: Element) {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function submit(form: HTMLFormElement) {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("admin product form modal", () => {
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
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:product-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    routerMocks.push.mockReset();
    routerMocks.refresh.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("keeps the complete draft open after failure and navigates only after a successful retry", async () => {
    await act(async () => {
      root.render(createElement(ProductFormModal, {
        groups: [{ id: "group-1", name: "ChatGPT", status: "ACTIVE" }],
        mode: "create",
      }));
    });

    await act(async () => click(container.querySelector("button")!));
    const form = document.body.querySelector(".product-form-modal form") as HTMLFormElement;
    const name = form.elements.namedItem("name") as HTMLInputElement;
    const price = form.elements.namedItem("price") as HTMLInputElement;
    const group = form.elements.namedItem("groupId") as HTMLSelectElement;
    const editor = form.querySelector('[role="textbox"]') as HTMLDivElement;
    const image = form.elements.namedItem("image") as HTMLInputElement;
    const imageFile = new File(["image"], "catalog.png", { type: "image/png" });

    name.value = "ChatGPT K12 panjang";
    price.value = "17500";
    await act(async () => {
      group.value = "group-1";
      group.dispatchEvent(new Event("change", { bubbles: true }));
      editor.textContent = "Deskripsi panjang yang tidak boleh hilang setelah server menolak.";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      Object.defineProperty(image, "files", {
        configurable: true,
        value: [imageFile],
      });
      image.dispatchEvent(new Event("change", { bubbles: true }));
    });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: false,
      error: "product-description",
    }), {
      status: 422,
      headers: { "content-type": "application/json" },
    }));

    await act(async () => submit(form));
    expect(document.body.textContent).toContain("Buat produk baru?");
    await act(async () => {
      click([...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes("Ya, proses"))!);
      await Promise.resolve();
    });

    expect(document.body.querySelector(".product-form-modal")).toBeTruthy();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("Format deskripsi Indonesia atau English tidak valid");
    expect(name.value).toBe("ChatGPT K12 panjang");
    expect(price.value).toBe("17500");
    expect(group.value).toBe("group-1");
    expect((form.elements.namedItem("description") as HTMLTextAreaElement).value)
      .toContain("Deskripsi panjang yang tidak boleh hilang");
    expect(image.files?.[0]).toBe(imageFile);
    expect(document.body.querySelector(".admin-processing-backdrop")).toBeNull();
    expect(routerMocks.push).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      redirectTo: "/admin/products?notice=product-created",
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));

    await act(async () => submit(form));
    await act(async () => {
      click([...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes("Ya, proses"))!);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(routerMocks.push).toHaveBeenCalledWith("/admin/products?notice=product-created");
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector(".product-form-modal")).toBeNull();
  });

  it("keeps the modal open for network failures and while an upload is still processing", async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectRequest = reject;
    }));

    await act(async () => {
      root.render(createElement(ProductFormModal, { mode: "create" }));
    });
    await act(async () => click(container.querySelector("button")!));
    const form = document.body.querySelector(".product-form-modal form") as HTMLFormElement;
    (form.elements.namedItem("name") as HTMLInputElement).value = "Produk jaringan";
    (form.elements.namedItem("price") as HTMLInputElement).value = "10000";
    const editor = form.querySelector('[role="textbox"]') as HTMLDivElement;
    await act(async () => {
      editor.textContent = "Draft tetap aman";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      submit(form);
    });
    await act(async () => {
      click([...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes("Ya, proses"))!);
      await Promise.resolve();
    });

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.body.querySelector(".product-form-modal")).toBeTruthy();
    expect(document.body.querySelector(".admin-processing-backdrop")).toBeTruthy();

    await act(async () => {
      rejectRequest?.(new Error("offline"));
      await Promise.resolve();
    });

    expect(document.body.querySelector(".product-form-modal")).toBeTruthy();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("Koneksi ke server terputus");
    expect((form.elements.namedItem("description") as HTMLTextAreaElement).value).toBe("Draft tetap aman");
    expect(document.body.querySelector(".admin-processing-backdrop")).toBeNull();
  });
});
