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

import { AccountRedeemDescriptionControl } from "@/components/admin/account-redeem-description-control";

describe("account redeem description control", () => {
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

  it("keeps the long description draft after a failed save", async () => {
    await act(async () => {
      root.render(createElement(AccountRedeemDescriptionControl, {
        defaultDescription: "Deskripsi default",
        description: "Deskripsi awal",
        isDefault: false,
        maxLength: 3_000,
        updatedAt: null,
      }));
    });

    const form = container.querySelector("form") as HTMLFormElement;
    const textarea = form.elements.namedItem("description") as HTMLTextAreaElement;
    const draft = "Deskripsi claim yang sudah ditulis panjang dan tidak boleh hilang ketika server gagal.";
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(textarea, draft);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: false,
      error: "description",
    }), {
      status: 422,
      headers: { "content-type": "application/json" },
    }));

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(textarea.value).toBe(draft);
    expect(document.body.querySelector('[role="alert"]')?.textContent)
      .toContain("Deskripsi tidak dapat disimpan");
    expect(container.querySelector(".admin-processing-backdrop")).toBeNull();
    expect(routerMocks.push).not.toHaveBeenCalled();
  });
});
