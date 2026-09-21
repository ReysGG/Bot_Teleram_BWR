// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InventoryActions } from "@/components/admin/inventory-actions";

describe("admin inventory row actions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("always exposes detail and direct download without destructive reserved actions", async () => {
    await act(async () => {
      root.render(createElement(InventoryActions, {
        id: "stock-reserved-1",
        status: "RESERVED",
        archived: false,
        returnTo: "/admin/inventory/available#inventory-ledger",
      }));
    });

    expect(container.textContent).toContain("Lihat detail");
    expect(container.textContent).toContain("Download");
    expect(container.textContent).toContain("Terkunci oleh checkout aktif");
    expect(container.textContent).not.toContain("Edit");
    expect(container.textContent).not.toContain("Hapus permanen");
    expect(container.querySelector('a[href="/api/admin/inventory/stock-reserved-1/file"]'))
      .toBeTruthy();
  });

  it("keeps permanent delete hidden for delivered stock", async () => {
    await act(async () => {
      root.render(createElement(InventoryActions, {
        id: "stock-delivered-1",
        status: "DELIVERED",
        archived: false,
        returnTo: "/admin/inventory/sold#inventory-ledger",
      }));
    });

    expect(container.textContent).toContain("Lihat detail");
    expect(container.textContent).toContain("Riwayat penjualan dilindungi");
    expect(container.textContent).not.toContain("Hapus permanen");
  });
});
