// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramRichTextEditor } from "@/components/admin/telegram-rich-text-editor";

const baseProps = {
  name: "description",
  entitiesName: "descriptionEntities",
  label: "Deskripsi produk",
  maxLength: 100,
  placeholder: "Tulis deskripsi",
};

describe("TelegramRichTextEditor", () => {
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

  it("keeps typed content visible while syncing the form value and preview", async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(createElement(TelegramRichTextEditor, {
        ...baseProps,
        initialText: "Hello",
        initialEntities: [{ type: "bold", offset: 0, length: 5 }],
        onChange,
      }));
    });

    const editor = container.querySelector(".telegram-rich-editor") as HTMLDivElement;
    expect(editor.innerHTML).toContain("<strong>Hello</strong>");

    await act(async () => {
      editor.append(document.createTextNode(" updated"));
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    });

    expect(editor.textContent).toBe("Hello updated");
    expect((container.querySelector('textarea[name="description"]') as HTMLTextAreaElement).value)
      .toBe("Hello updated");
    expect(container.querySelector(".telegram-rich-preview")?.textContent).toContain("Hello updated");
    expect(onChange).toHaveBeenLastCalledWith({
      text: "Hello updated",
      entities: [{ type: "bold", offset: 0, length: 5 }],
    });
  });

  it("does not reset edits when switching between write and preview", async () => {
    await act(async () => {
      root.render(createElement(TelegramRichTextEditor, {
        ...baseProps,
        initialText: "Draft",
      }));
    });

    const editor = container.querySelector(".telegram-rich-editor") as HTMLDivElement;
    await act(async () => {
      editor.append(document.createTextNode(" baru"));
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    });

    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    await act(async () => tabs.find((tab) => tab.textContent?.includes("Preview"))?.click());
    expect(container.querySelector(".telegram-rich-preview")?.textContent).toContain("Draft baru");

    await act(async () => tabs.find((tab) => tab.textContent?.includes("Tulis"))?.click());
    expect(editor.textContent).toBe("Draft baru");
  });

  it("restores the last valid document after content exceeds the limit", async () => {
    await act(async () => {
      root.render(createElement(TelegramRichTextEditor, {
        ...baseProps,
        initialText: "Valid",
        maxLength: 5,
      }));
    });

    const editor = container.querySelector(".telegram-rich-editor") as HTMLDivElement;
    await act(async () => {
      editor.textContent = "Too long";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    });

    expect(editor.textContent).toBe("Valid");
    expect(container.querySelector(".field-error")?.textContent).toContain("5 karakter");
    const selection = window.getSelection();
    expect(selection?.rangeCount).toBe(1);
    expect(editor.contains(selection?.getRangeAt(0).commonAncestorContainer ?? null)).toBe(true);
  });

  it("canonicalizes CRLF before applying Telegram entity offsets", async () => {
    await act(async () => {
      root.render(createElement(TelegramRichTextEditor, {
        ...baseProps,
        initialText: "A\r\nBold",
        initialEntities: [{ type: "bold", offset: 2, length: 4 }],
      }));
    });

    const editor = container.querySelector(".telegram-rich-editor") as HTMLDivElement;
    expect(editor.innerHTML).toContain("A<br>");
    expect(editor.innerHTML).toContain("<strong>Bold</strong>");
    expect((container.querySelector('textarea[name="description"]') as HTMLTextAreaElement).value)
      .toBe("A\nBold");
  });

  it("disables formatting commands while preview is active", async () => {
    await act(async () => {
      root.render(createElement(TelegramRichTextEditor, {
        ...baseProps,
        initialText: "Preview me",
      }));
    });

    const previewTab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find((tab) => tab.textContent?.includes("Preview"));
    await act(async () => previewTab?.click());

    const toolbarButtons = [...container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')];
    expect(toolbarButtons.length).toBeGreaterThan(0);
    expect(toolbarButtons.every((button) => button.disabled)).toBe(true);
  });

  it("reinitializes only when the supplied document actually changes", async () => {
    await act(async () => {
      root.render(createElement(TelegramRichTextEditor, {
        ...baseProps,
        initialText: "Produk pertama",
      }));
    });

    const editor = container.querySelector(".telegram-rich-editor") as HTMLDivElement;
    await act(async () => {
      editor.append(document.createTextNode(" edit"));
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    });
    expect(editor.textContent).toBe("Produk pertama edit");

    await act(async () => {
      root.render(createElement(TelegramRichTextEditor, {
        ...baseProps,
        initialText: "Produk kedua",
      }));
    });

    expect(editor.textContent).toBe("Produk kedua");
    expect((container.querySelector('textarea[name="description"]') as HTMLTextAreaElement).value)
      .toBe("Produk kedua");
  });

  it("applies and removes inline Telegram entities without deprecated browser commands", async () => {
    await act(async () => {
      root.render(createElement(TelegramRichTextEditor, {
        ...baseProps,
        initialText: "Format saya",
        previewMode: "side",
      }));
    });

    const editor = container.querySelector(".telegram-rich-editor") as HTMLDivElement;
    const selectText = () => {
      const textNode = editor.querySelector("strong")?.firstChild ?? editor.firstChild;
      expect(textNode).toBeTruthy();
      const range = document.createRange();
      range.setStart(textNode!, 0);
      range.setEnd(textNode!, 6);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    };

    selectText();
    await act(async () => {
      (container.querySelector('button[aria-label="Bold"]') as HTMLButtonElement).click();
    });
    expect(editor.innerHTML).toContain("<strong>Format</strong>");
    expect(JSON.parse((container.querySelector('input[name="descriptionEntities"]') as HTMLInputElement).value))
      .toEqual([{ type: "bold", offset: 0, length: 6 }]);
    expect(container.querySelector(".telegram-rich-preview strong")?.textContent).toBe("Format");

    selectText();
    await act(async () => {
      (container.querySelector('button[aria-label="Bold"]') as HTMLButtonElement).click();
    });
    expect(editor.querySelector("strong")).toBeNull();
    expect(JSON.parse((container.querySelector('input[name="descriptionEntities"]') as HTMLInputElement).value))
      .toEqual([]);
  });

  it("shows a live preview beside the editor without requiring a preview tab", async () => {
    await act(async () => {
      root.render(createElement(TelegramRichTextEditor, {
        ...baseProps,
        initialText: "Langsung terlihat",
        initialEntities: [{ type: "italic", offset: 0, length: 8 }],
        previewMode: "side",
      }));
    });

    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector(".telegram-rich-editor.is-hidden")).toBeNull();
    expect(container.querySelector(".telegram-rich-preview.is-hidden")).toBeNull();
    expect(container.querySelector(".telegram-rich-preview em")?.textContent).toBe("Langsung");
  });

  it("round-trips a blockquote without inserting an extra blank line", async () => {
    await act(async () => {
      root.render(createElement(TelegramRichTextEditor, {
        ...baseProps,
        initialText: "Baris satu\nBaris dua",
      }));
    });

    const editor = container.querySelector(".telegram-rich-editor") as HTMLDivElement;
    const firstText = editor.firstChild as Text;
    const range = document.createRange();
    range.setStart(firstText, 0);
    range.setEnd(firstText, 10);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    await act(async () => {
      (container.querySelector('button[aria-label="Kutipan"]') as HTMLButtonElement).click();
    });
    expect(editor.querySelector("blockquote")?.textContent).toBe("Baris satu");

    await act(async () => {
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    });
    expect((container.querySelector('textarea[name="description"]') as HTMLTextAreaElement).value)
      .toBe("Baris satu\nBaris dua");
  });

  it("applies and removes bullet prefixes while preserving entity offsets", async () => {
    await act(async () => {
      root.render(createElement(TelegramRichTextEditor, {
        ...baseProps,
        initialText: "Satu\nDua",
        initialEntities: [{ type: "bold", offset: 5, length: 3 }],
      }));
    });

    const editor = container.querySelector(".telegram-rich-editor") as HTMLDivElement;
    const selectAll = () => {
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    };

    selectAll();
    await act(async () => {
      (container.querySelector('button[aria-label="Bullet list"]') as HTMLButtonElement).click();
    });
    expect((container.querySelector('textarea[name="description"]') as HTMLTextAreaElement).value)
      .toBe("- Satu\n- Dua");
    expect(JSON.parse((container.querySelector('input[name="descriptionEntities"]') as HTMLInputElement).value))
      .toEqual([{ type: "bold", offset: 9, length: 3 }]);
    expect(container.querySelector(".telegram-rich-preview strong")?.textContent).toBe("Dua");

    selectAll();
    await act(async () => {
      (container.querySelector('button[aria-label="Bullet list"]') as HTMLButtonElement).click();
    });
    expect((container.querySelector('textarea[name="description"]') as HTMLTextAreaElement).value)
      .toBe("Satu\nDua");
    expect(JSON.parse((container.querySelector('input[name="descriptionEntities"]') as HTMLInputElement).value))
      .toEqual([{ type: "bold", offset: 5, length: 3 }]);
  });

  it("creates a numbered list for the current line from a collapsed caret", async () => {
    await act(async () => {
      root.render(createElement(TelegramRichTextEditor, {
        ...baseProps,
        initialText: "Satu\nDua",
        initialEntities: [{ type: "italic", offset: 5, length: 3 }],
      }));
    });

    const editor = container.querySelector(".telegram-rich-editor") as HTMLDivElement;
    const secondLine = editor.querySelector("em")?.firstChild as Text;
    const range = document.createRange();
    range.setStart(secondLine, 1);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    await act(async () => {
      (container.querySelector('button[aria-label="Numbered list"]') as HTMLButtonElement).click();
    });
    expect((container.querySelector('textarea[name="description"]') as HTMLTextAreaElement).value)
      .toBe("Satu\n1. Dua");
    expect(JSON.parse((container.querySelector('input[name="descriptionEntities"]') as HTMLInputElement).value))
      .toEqual([{ type: "italic", offset: 8, length: 3 }]);
    expect(container.querySelector(".telegram-rich-preview em")?.textContent).toBe("Dua");
    expect(window.getSelection()?.isCollapsed).toBe(true);
    expect(window.getSelection()?.anchorNode?.textContent).toBe("Dua");
    expect(window.getSelection()?.anchorOffset).toBe(1);
  });
});
