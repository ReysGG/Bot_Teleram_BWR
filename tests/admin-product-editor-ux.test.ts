// @vitest-environment happy-dom

import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));
import { AdminFormSection } from "@/components/admin/admin-form-section";
import {
  CatalogDescriptionFields,
  LocalizedCatalogDescriptionFields,
} from "@/components/admin/catalog-description-fields";
import { ProductEditForm } from "@/components/admin/product-edit-form";
import { ProductGroupForm } from "@/components/admin/product-group-form";

describe("admin product editing UX", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    routerMocks.push.mockReset();
    routerMocks.refresh.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders catalog writing and Telegram preview together by default", async () => {
    await act(async () => {
      root.render(createElement(CatalogDescriptionFields, {
        description: "Produk dengan format",
        entities: [{ type: "bold", offset: 0, length: 6 }],
      }));
    });

    expect(container.querySelector(".telegram-rich-workbench.mode-side")).toBeTruthy();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector(".telegram-rich-preview strong")?.textContent).toBe("Produk");
  });

  it("keeps Indonesian and optional English editors mounted as separate form fields", async () => {
    await act(async () => {
      root.render(createElement(LocalizedCatalogDescriptionFields, {
        description: "Deskripsi utama",
        entities: [],
        descriptionEn: "English description",
        entitiesEn: [{ type: "bold", offset: 0, length: 7 }],
      }));
    });

    expect(container.querySelector('textarea[name="description"]')).toBeTruthy();
    expect(container.querySelector('input[name="descriptionEntities"]')).toBeTruthy();
    expect(container.querySelector('textarea[name="descriptionEn"]')).toBeTruthy();
    expect(container.querySelector('input[name="descriptionEntitiesEn"]')).toBeTruthy();
    expect(container.querySelectorAll('[role="textbox"]')).toHaveLength(2);
    expect(container.querySelector(".localized-catalog-english")?.hasAttribute("open")).toBe(true);
  });

  it("keeps secondary fields mounted behind task tabs and preserves changes when switching", async () => {
    await act(async () => {
      root.render(createElement(ProductEditForm, {
        groups: [{ id: "group-1", name: "ChatGPT", status: "ACTIVE" }],
        product: {
          id: "product-1",
          name: "ChatGPT Team",
          description: "Akun ChatGPT Team siap pakai.",
          descriptionEntities: [],
          price: 10000,
          imageUrl: null,
          attachmentOriginalFilename: null,
          postDeliveryInstructions: "Buka halaman redeem.",
          postDeliveryEntities: [],
          redeemUrl: "https://example.com/redeem",
          status: "ACTIVE",
          preorderEnabled: false,
          preorderEtaText: null,
          preorderLimit: null,
          bannedStockPolicy: "BLOCKED",
          groupId: null,
          variantLabel: null,
          groupSortOrder: 0,
        },
      }));
    });

    const panels = [...container.querySelectorAll<HTMLElement>("[data-editor-tab]")];
    expect(panels).toHaveLength(3);
    expect(panels.filter(panel => !panel.hidden)).toHaveLength(1);
    expect(panels[0].dataset.editorTab).toBe("info");
    const tabs = container.querySelectorAll<HTMLButtonElement>('[aria-label="Bagian produk"] [role="tab"]');
    await act(async () => tabs[2].click());
    expect(panels[2].hidden).toBe(false);
    const groupSelect = container.querySelector('select[name="groupId"]') as HTMLSelectElement;
    await act(async () => { groupSelect.value = "group-1"; groupSelect.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => tabs[0].click());
    await act(async () => tabs[2].click());
    expect(groupSelect.value).toBe("group-1");
    expect(container.querySelector('.product-editor-summary')?.textContent).toContain("ChatGPT");
  });

  it("keeps an edited description on screen when the product update fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: "product-description",
    }), {
      status: 422,
      headers: { "content-type": "application/json" },
    })));
    await act(async () => {
      root.render(createElement(ProductEditForm, {
        groups: [],
        product: {
          id: "product-1",
          name: "ChatGPT Team",
          description: "Deskripsi awal",
          descriptionEntities: [],
          price: 10000,
          imageUrl: null,
          attachmentOriginalFilename: null,
          postDeliveryInstructions: null,
          postDeliveryEntities: [],
          redeemUrl: null,
          status: "ACTIVE",
          preorderEnabled: false,
          preorderEtaText: null,
          preorderLimit: null,
          bannedStockPolicy: "BLOCKED",
          groupId: null,
          variantLabel: null,
          groupSortOrder: 0,
        },
      }));
    });

    const form = container.querySelector("form") as HTMLFormElement;
    const name = form.elements.namedItem("name") as HTMLInputElement;
    const editor = form.querySelector('[role="textbox"]') as HTMLDivElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "ChatGPT Team revisi");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      editor.textContent = "Deskripsi revisi yang panjang dan harus tetap ada";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      const confirm = [...document.body.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Ya, simpan"));
      confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="alert"]')?.textContent)
      .toContain("Format deskripsi Indonesia atau English tidak valid");
    expect(name.value).toBe("ChatGPT Team revisi");
    expect((form.elements.namedItem("description") as HTMLTextAreaElement).value)
      .toBe("Deskripsi revisi yang panjang dan harus tetap ada");
    expect(routerMocks.push).not.toHaveBeenCalled();
  });

  it("uses the compact group settings grid and immediate catalog preview", async () => {
    await act(async () => {
      root.render(createElement(ProductGroupForm, {
        group: {
          id: "group-1",
          name: "ChatGPT",
          description: "Pilih varian ChatGPT.",
          descriptionEntities: [{ type: "italic", offset: 0, length: 5 }],
          imageUrl: null,
          status: "ACTIVE",
          sortOrder: 0,
        },
      }));
    });

    expect(container.querySelector(".product-group-settings-grid")?.children).toHaveLength(4);
    expect(container.querySelector(".telegram-rich-workbench.mode-side")).toBeTruthy();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector(".product-group-form-footer .button")?.textContent)
      .toContain("Simpan grup");
  });

  it("keeps both group description drafts after an enhanced validation failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: "group-description",
    }), {
      status: 422,
      headers: { "content-type": "application/json" },
    })));
    await act(async () => {
      root.render(createElement(ProductGroupForm, {
        group: {
          id: "group-1",
          name: "ChatGPT",
          description: "Deskripsi grup awal",
          descriptionEntities: [],
          descriptionEn: "Initial group description",
          descriptionEntitiesEn: [],
          imageUrl: null,
          status: "ACTIVE",
          sortOrder: 0,
        },
      }));
    });

    const form = container.querySelector("form") as HTMLFormElement;
    const name = form.elements.namedItem("name") as HTMLInputElement;
    const editors = form.querySelectorAll<HTMLDivElement>('[role="textbox"]');
    name.value = "ChatGPT revised";
    await act(async () => {
      editors[0].textContent = "Deskripsi grup yang sudah direvisi";
      editors[0].dispatchEvent(new Event("input", { bubbles: true }));
      editors[1].textContent = "Revised English group description";
      editors[1].dispatchEvent(new Event("input", { bubbles: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      const confirm = [...document.body.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Ya, simpan"));
      confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="alert"]')?.textContent)
      .toContain("Format deskripsi Indonesia atau English tidak valid");
    expect(name.value).toBe("ChatGPT revised");
    expect((form.elements.namedItem("description") as HTMLTextAreaElement).value)
      .toBe("Deskripsi grup yang sudah direvisi");
    expect((form.elements.namedItem("descriptionEn") as HTMLTextAreaElement).value)
      .toBe("Revised English group description");
    expect(routerMocks.push).not.toHaveBeenCalled();
  });

  it("renders a reusable collapsible form section with an operator-facing status", async () => {
    const sectionProps: ComponentProps<typeof AdminFormSection> = {
      collapsible: true,
      defaultOpen: false,
      eyebrow: "Opsional",
      status: "Belum diatur",
      title: "Panduan pembeli",
      children: createElement("p", null, "Isi panduan"),
    };
    await act(async () => {
      root.render(createElement(AdminFormSection, sectionProps));
    });

    const section = container.querySelector("details") as HTMLDetailsElement;
    expect(section.open).toBe(false);
    expect(section.querySelector("summary")?.textContent).toContain("Panduan pembeli");
    expect(section.querySelector(".admin-form-section-status")?.textContent).toBe("Belum diatur");
  });
});
