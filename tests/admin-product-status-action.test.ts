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

import { ProductStatusAction } from "@/components/admin/product-status-action";

function click(element: Element) {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function findButton(text: string) {
  return [...document.body.querySelectorAll("button")]
    .find((button) => button.textContent?.includes(text));
}

describe("admin product status action", () => {
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

  it("posts INACTIVE through the reusable dialog and navigates only after success", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      const body = init.body as FormData;
      expect(body.get("status")).toBe("INACTIVE");
      expect(body.get("returnTo")).toBe("/admin/products/inactive#product-list");
      expect(body.get("failureReturnTo")).toBe("/admin/products?q=k12#product-list");
      return new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      });
    });
    await act(async () => {
      root.render(createElement(ProductStatusAction, {
        failureReturnTo: "/admin/products?q=k12#product-list",
        id: "product-1",
        name: "ChatGPT K12",
        returnTo: "/admin/products/inactive#product-list",
        status: "ACTIVE",
      }));
    });

    await act(async () => click(findButton("Nonaktifkan")!));
    expect(document.body.querySelector(".admin-dialog-content.confirm-modal")).toBeTruthy();
    expect(document.body.textContent).toContain("Stok, order, invoice yang sudah dibuat");

    await act(async () => {
      click(findButton("Ya, nonaktifkan")!);
      await Promise.resolve();
    });
    expect(document.body.querySelector(".admin-processing-card")).toBeTruthy();
    expect(routerMocks.push).not.toHaveBeenCalled();

    await act(async () => {
      resolveRequest?.(new Response(JSON.stringify({
        ok: true,
        redirectTo: "/admin/products/inactive?notice=product-deactivated#product-list",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
      await Promise.resolve();
    });

    expect(document.body.querySelector(".admin-processing-card")).toBeNull();
    expect(routerMocks.push).toHaveBeenCalledWith(
      "/admin/products/inactive?notice=product-deactivated#product-list",
    );
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows an actionable error and remains reusable when deactivation fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: false,
      error: "product-status",
    }), {
      status: 500,
      headers: { "content-type": "application/json" },
    }));
    await act(async () => {
      root.render(createElement(ProductStatusAction, {
        id: "product-1",
        name: "ChatGPT K12",
        returnTo: "/admin/products/inactive#product-list",
        status: "ACTIVE",
      }));
    });

    await act(async () => click(findButton("Nonaktifkan")!));
    await act(async () => {
      click(findButton("Ya, nonaktifkan")!);
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="alert"]')?.textContent)
      .toContain("Produk masih dapat dibeli sampai perubahan berhasil");
    expect(routerMocks.push).not.toHaveBeenCalled();

    await act(async () => click(findButton("Tutup")!));
    expect(findButton("Nonaktifkan")?.hasAttribute("disabled")).toBe(false);
  });
});
