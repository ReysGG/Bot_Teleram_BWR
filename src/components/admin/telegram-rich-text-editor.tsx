"use client";

import {
  Bold,
  Braces,
  Eye,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquareQuote,
  RemoveFormatting,
  PenLine,
  ShieldQuestion,
  Strikethrough,
  Underline,
  X,
} from "lucide-react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  normalizeTelegramRichTextDocument,
  safeTelegramRichTextEntities,
  telegramRichTextToSafeHtml,
  type TelegramRichTextEntity,
  type TelegramRichTextType,
} from "@/lib/telegram-rich-text";

type EditorValue = { text: string; entities: TelegramRichTextEntity[] };
type EditorSelection = EditorValue & { start: number; end: number };
type TextEdit = { start: number; end: number; text: string };

const SELECTION_MARKER_ATTRIBUTE = "data-tg-selection-marker";

function appendNewline(state: EditorValue) {
  if (state.text && !state.text.endsWith("\n")) state.text += "\n";
}

function entityTypeForElement(element: HTMLElement): TelegramRichTextType | null {
  const tag = element.tagName;
  if (tag === "B" || tag === "STRONG") return "bold";
  if (tag === "I" || tag === "EM") return "italic";
  if (tag === "U") return "underline";
  if (tag === "S" || tag === "STRIKE" || tag === "DEL") return "strikethrough";
  if (tag === "CODE") return "code";
  if (tag === "BLOCKQUOTE") return "blockquote";
  if (element.dataset.tgEntity === "spoiler") return "spoiler";
  if (tag === "A") return "text_link";
  return null;
}

function readEditor(root: HTMLElement) {
  const state: EditorValue = { text: "", entities: [] };
  const markers = new Map<string, number>();

  function visit(node: Node, listIndex?: number) {
    if (node.nodeType === Node.TEXT_NODE) {
      state.text += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const marker = node.getAttribute(SELECTION_MARKER_ATTRIBUTE);
    if (marker) {
      markers.set(marker, state.text.length);
      return;
    }
    if (node.tagName === "BR") {
      state.text += "\n";
      return;
    }

    // Telegram blockquotes are entity wrappers; explicit BR nodes remain the
    // only newline source so formatting a line cannot create a blank line.
    const block = ["DIV", "P"].includes(node.tagName);
    const listItem = node.tagName === "LI";
    if (block && state.text && !state.text.endsWith("\n")) appendNewline(state);
    if (listItem) {
      appendNewline(state);
      state.text += listIndex === undefined ? "- " : `${listIndex + 1}. `;
    }

    const type = entityTypeForElement(node);
    const start = state.text.length;
    if (node.tagName === "OL" || node.tagName === "UL") {
      [...node.children].forEach((child, index) =>
        visit(child, node.tagName === "OL" ? index : undefined),
      );
    } else {
      [...node.childNodes].forEach((child) => visit(child));
    }
    const end = state.text.length;

    if (type && end > start) {
      if (type === "text_link") {
        const href = node.getAttribute("href") ?? "";
        try {
          const url = new URL(href);
          if (
            url.protocol === "https:" &&
            url.hostname &&
            !url.username &&
            !url.password
          ) {
            state.entities.push({ type, offset: start, length: end - start, url: url.toString() });
          }
        } catch {
          // Invalid links are kept as readable text and omitted as Telegram entities.
        }
      } else {
        state.entities.push({ type, offset: start, length: end - start });
      }
    }

    if ((block || listItem) && state.text && !state.text.endsWith("\n")) {
      appendNewline(state);
    }
  }

  [...root.childNodes].forEach((node) => visit(node));
  return { ...state, markers };
}

function serializeEditor(root: HTMLElement, maxLength: number): EditorValue {
  const state = readEditor(root);
  return normalizeTelegramRichTextDocument({
    text: state.text,
    entities: state.entities,
    minLength: 0,
    maxLength,
  });
}

function normalizedCapturedSelection(
  state: ReturnType<typeof readEditor>,
  rawStart: number,
  rawEnd: number,
  maxLength: number,
) {
  const leadingTrim = state.text.length - state.text.trimStart().length;
  const documentValue = normalizeTelegramRichTextDocument({
    text: state.text,
    entities: state.entities,
    minLength: 0,
    maxLength,
  });
  const start = Math.max(0, Math.min(documentValue.text.length, rawStart - leadingTrim));
  const end = Math.max(start, Math.min(documentValue.text.length, rawEnd - leadingTrim));
  return { ...documentValue, start, end };
}

function captureEditorSelection(
  editor: HTMLElement,
  maxLength: number,
  allowCollapsed = false,
): EditorSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;
  if (selection.isCollapsed) {
    if (!allowCollapsed) return null;
    const marker = document.createElement("span");
    marker.setAttribute(SELECTION_MARKER_ATTRIBUTE, "caret");
    marker.contentEditable = "false";
    try {
      const caretRange = range.cloneRange();
      caretRange.collapse(true);
      caretRange.insertNode(marker);
      const raw = readEditor(editor);
      const rawCaret = raw.markers.get("caret");
      if (rawCaret === undefined) return null;
      return normalizedCapturedSelection(raw, rawCaret, rawCaret, maxLength);
    } finally {
      marker.remove();
    }
  }

  const startMarker = document.createElement("span");
  const endMarker = document.createElement("span");
  startMarker.setAttribute(SELECTION_MARKER_ATTRIBUTE, "start");
  endMarker.setAttribute(SELECTION_MARKER_ATTRIBUTE, "end");
  startMarker.contentEditable = "false";
  endMarker.contentEditable = "false";

  try {
    const endRange = range.cloneRange();
    endRange.collapse(false);
    endRange.insertNode(endMarker);
    const startRange = range.cloneRange();
    startRange.collapse(true);
    startRange.insertNode(startMarker);

    const raw = readEditor(editor);
    const rawStart = raw.markers.get("start");
    const rawEnd = raw.markers.get("end");
    if (rawStart === undefined || rawEnd === undefined) return null;

    const documentValue = normalizedCapturedSelection(raw, rawStart, rawEnd, maxLength);
    const { start, end } = documentValue;
    if (end <= start) return null;
    return documentValue;
  } finally {
    startMarker.remove();
    endMarker.remove();
  }
}

function splitEntityOutsideRange(
  entity: TelegramRichTextEntity,
  start: number,
  end: number,
) {
  const entityEnd = entity.offset + entity.length;
  if (entityEnd <= start || entity.offset >= end) return [{ ...entity }];
  const remaining: TelegramRichTextEntity[] = [];
  if (entity.offset < start) {
    remaining.push({ ...entity, length: start - entity.offset });
  }
  if (entityEnd > end) {
    remaining.push({ ...entity, offset: end, length: entityEnd - end });
  }
  return remaining;
}

function toggleEntityFormat(
  selection: EditorSelection,
  type: TelegramRichTextType,
  url?: string,
) {
  let { start, end } = selection;
  if (type === "blockquote") {
    start = selection.text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextNewline = selection.text.indexOf("\n", end);
    end = nextNewline === -1 ? selection.text.length : nextNewline;
  }

  const matching = selection.entities.filter((entity) =>
    entity.type === type &&
    entity.url === url &&
    entity.offset <= start &&
    entity.offset + entity.length >= end,
  );
  const shouldRemove = type !== "text_link" && matching.length > 0;
  const entities = selection.entities.flatMap((entity) => {
    if (entity.type !== type) return [{ ...entity }];
    if (type === "text_link" || shouldRemove) {
      return splitEntityOutsideRange(entity, start, end);
    }
    return [{ ...entity }];
  });

  if (!shouldRemove) {
    let mergedStart = start;
    let mergedEnd = end;
    const unrelated = entities.filter((entity) => {
      if (entity.type !== type || entity.url !== url) return true;
      const entityEnd = entity.offset + entity.length;
      if (entityEnd < start || entity.offset > end) return true;
      mergedStart = Math.min(mergedStart, entity.offset);
      mergedEnd = Math.max(mergedEnd, entityEnd);
      return false;
    });
    unrelated.push({ type, offset: mergedStart, length: mergedEnd - mergedStart, ...(url ? { url } : {}) });
    return normalizeTelegramRichTextDocument({
      text: selection.text,
      entities: unrelated,
      minLength: 0,
      maxLength: Math.max(1, selection.text.length),
    });
  }

  return normalizeTelegramRichTextDocument({
    text: selection.text,
    entities,
    minLength: 0,
    maxLength: Math.max(1, selection.text.length),
  });
}

function clearEntityFormats(selection: EditorSelection) {
  return normalizeTelegramRichTextDocument({
    text: selection.text,
    entities: selection.entities.flatMap((entity) =>
      splitEntityOutsideRange(entity, selection.start, selection.end),
    ),
    minLength: 0,
    maxLength: Math.max(1, selection.text.length),
  });
}

function applyTextEdits(
  documentValue: EditorValue,
  edits: readonly TextEdit[],
  maxLength: number,
) {
  const sorted = [...edits].sort((left, right) => left.start - right.start);
  let cursor = 0;
  let text = "";
  for (const edit of sorted) {
    text += documentValue.text.slice(cursor, edit.start);
    text += edit.text;
    cursor = edit.end;
  }
  text += documentValue.text.slice(cursor);

  const entities = documentValue.entities.flatMap((entity) => {
    const start = mapOffsetThroughTextEdits(sorted, entity.offset, "start");
    const end = mapOffsetThroughTextEdits(sorted, entity.offset + entity.length, "end");
    if (end <= start) return [];
    return [{ ...entity, offset: start, length: end - start }];
  });

  return normalizeTelegramRichTextDocument({
    text,
    entities,
    minLength: 0,
    maxLength,
  });
}

function mapOffsetThroughTextEdits(
  edits: readonly TextEdit[],
  offset: number,
  edge: "start" | "end",
) {
  let delta = 0;
  for (const edit of edits) {
    if (offset < edit.start) break;
    if (offset > edit.end) {
      delta += edit.text.length - (edit.end - edit.start);
      continue;
    }
    const replacementStart = edit.start + delta;
    if (edit.start === edit.end && offset === edit.start) {
      return edge === "start" ? replacementStart + edit.text.length : replacementStart;
    }
    if (offset === edit.start) return replacementStart;
    if (offset === edit.end) return replacementStart + edit.text.length;
    return edge === "start" ? replacementStart : replacementStart + edit.text.length;
  }
  return offset + delta;
}

function toggleListFormat(
  selection: EditorSelection,
  type: "unordered" | "ordered",
  maxLength: number,
) {
  const lineStart = selection.text.lastIndexOf("\n", Math.max(0, selection.start - 1)) + 1;
  const selectionEndProbe = selection.end > selection.start && selection.text[selection.end - 1] === "\n"
    ? selection.end - 1
    : selection.end;
  const nextNewline = selection.text.indexOf("\n", selectionEndProbe);
  const lineEnd = nextNewline === -1 ? selection.text.length : nextNewline;
  const lines = selection.text.slice(lineStart, lineEnd).split("\n");
  const requestedPrefix = type === "unordered" ? /^- / : /^\d+\. /;
  const nonEmptyLines = lines.filter((line) => line.length > 0);
  const removeRequested = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => requestedPrefix.test(line));
  const edits: TextEdit[] = [];
  let offset = lineStart;
  let orderedIndex = 1;

  for (const line of lines) {
    const currentPrefix = line.match(/^(?:- |\d+\. )/)?.[0] ?? "";
    const nextPrefix = !line
      ? ""
      : removeRequested
        ? ""
        : type === "unordered"
          ? "- "
          : `${orderedIndex}. `;
    if (line) orderedIndex += 1;
    if (currentPrefix !== nextPrefix) {
      edits.push({ start: offset, end: offset + currentPrefix.length, text: nextPrefix });
    }
    offset += line.length + 1;
  }

  if (edits.length === 0) {
    return { documentValue: { text: selection.text, entities: selection.entities }, start: lineStart, end: lineEnd };
  }
  const sortedEdits = [...edits].sort((left, right) => left.start - right.start);
  const documentValue = applyTextEdits(selection, sortedEdits, maxLength);
  const start = mapOffsetThroughTextEdits(sortedEdits, selection.start, "start");
  const end = selection.start === selection.end
    ? start
    : mapOffsetThroughTextEdits(sortedEdits, selection.end, "end");
  return { documentValue, start, end };
}

function findDomPoint(root: HTMLElement, targetOffset: number) {
  let consumed = 0;
  let result: { node: Node; offset: number } | null = null;

  function visit(node: Node) {
    if (result) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (targetOffset <= consumed + length) {
        result = { node, offset: Math.max(0, targetOffset - consumed) };
        return;
      }
      consumed += length;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      const parent = node.parentNode;
      if (!parent) return;
      const index = [...parent.childNodes].indexOf(node);
      if (targetOffset <= consumed) {
        result = { node: parent, offset: index };
      } else if (targetOffset <= consumed + 1) {
        result = { node: parent, offset: index + 1 };
      }
      consumed += 1;
      return;
    }
    [...node.childNodes].forEach(visit);
  }

  [...root.childNodes].forEach(visit);
  return result ?? { node: root as Node, offset: root.childNodes.length };
}

export function TelegramRichTextEditor({
  name,
  entitiesName,
  label,
  initialText = "",
  initialEntities,
  maxLength,
  minLength = 0,
  placeholder,
  required = false,
  onChange,
  audience = "admin",
  helpText,
  previewMode = "toggle",
  onInvalid,
}: {
  name: string;
  entitiesName: string;
  label: string;
  initialText?: string | null;
  initialEntities?: unknown;
  maxLength: number;
  minLength?: number;
  placeholder: string;
  required?: boolean;
  onChange?: (value: EditorValue) => void;
  audience?: "public" | "private" | "admin";
  helpText?: string;
  previewMode?: "toggle" | "side" | "stack";
  onInvalid?: () => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorId = useId();
  const helperId = useId();
  const linkTitleId = useId();
  const normalizedInitialText = (initialText ?? "").replace(/\r\n?/g, "\n");
  const initialDocument = useMemo(() => ({
    text: normalizedInitialText,
    entities: safeTelegramRichTextEntities(initialEntities, normalizedInitialText),
  }), [initialEntities, normalizedInitialText]);
  const initialHtml = useMemo(
    () => telegramRichTextToSafeHtml(initialDocument),
    [initialDocument],
  );
  const initialSignature = useMemo(
    () => JSON.stringify(initialDocument),
    [initialDocument],
  );
  const appliedInitialSignatureRef = useRef<string | null>(null);
  const lastValidValueRef = useRef<EditorValue>(initialDocument);
  const savedLinkSelectionRef = useRef<EditorSelection | null>(null);
  const [value, setValue] = useState<EditorValue>(initialDocument);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkError, setLinkError] = useState("");
  const [editorError, setEditorError] = useState("");
  const [activeView, setActiveView] = useState<"write" | "preview">("write");

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || appliedInitialSignatureRef.current === initialSignature) return;

    editor.innerHTML = initialHtml;
    appliedInitialSignatureRef.current = initialSignature;
    lastValidValueRef.current = initialDocument;
    setValue(initialDocument);
    setEditorError("");
    setActiveView("write");
  }, [initialDocument, initialHtml, initialSignature]);

  function placeCaretAtEnd(editor: HTMLElement) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function syncValue() {
    if (!editorRef.current) return;
    try {
      const next = serializeEditor(editorRef.current, maxLength);
      lastValidValueRef.current = next;
      setValue(next);
      setEditorError("");
      onChange?.(next);
    } catch (error) {
      const previous = lastValidValueRef.current ?? initialDocument;
      editorRef.current.innerHTML = telegramRichTextToSafeHtml(previous);
      placeCaretAtEnd(editorRef.current);
      setValue(previous);
      setEditorError(
        error instanceof Error
          ? error.message
          : `Teks tidak boleh melebihi ${maxLength} karakter.`,
      );
    }
  }

  function commitFormattedValue(next: EditorValue, start: number, end: number) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = telegramRichTextToSafeHtml(next);
    lastValidValueRef.current = next;
    setValue(next);
    setEditorError("");
    onChange?.(next);

    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    const startPoint = findDomPoint(editor, start);
    const endPoint = findDomPoint(editor, end);
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function selectedDocument(allowCollapsed = false) {
    const editor = editorRef.current;
    if (!editor) return null;
    return captureEditorSelection(editor, maxLength, allowCollapsed);
  }

  function applyEntityFormat(type: Exclude<TelegramRichTextType, "text_link">) {
    const selected = selectedDocument();
    if (!selected) {
      setEditorError("Blok teks yang ingin diformat terlebih dahulu.");
      return;
    }
    try {
      const next = toggleEntityFormat(selected, type);
      commitFormattedValue(next, selected.start, selected.end);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Format tidak dapat diterapkan pada pilihan ini.");
    }
  }

  function clearFormatting() {
    const selected = selectedDocument();
    if (!selected) {
      setEditorError("Blok teks yang formatnya ingin dihapus terlebih dahulu.");
      return;
    }
    try {
      const next = clearEntityFormats(selected);
      commitFormattedValue(next, selected.start, selected.end);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Format tidak dapat dihapus.");
    }
  }

  function applyListFormat(type: "unordered" | "ordered") {
    const selected = selectedDocument(true);
    if (!selected) {
      setEditorError("Tempatkan kursor atau blok baris yang ingin dijadikan daftar.");
      return;
    }
    try {
      const next = toggleListFormat(selected, type, maxLength);
      commitFormattedValue(next.documentValue, next.start, next.end);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Daftar tidak dapat diterapkan.");
    }
  }

  function openLink() {
    const selected = selectedDocument();
    if (!selected) {
      setLinkError("Blok teks yang ingin dijadikan link terlebih dahulu.");
      setLinkOpen(true);
      return;
    }
    savedLinkSelectionRef.current = selected;
    setLinkError("");
    setLinkUrl("https://");
    setLinkOpen(true);
  }

  function applyLink() {
    try {
      const parsed = new URL(linkUrl.trim());
      if (
        parsed.protocol !== "https:" ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error("invalid");
      }
      const selected = savedLinkSelectionRef.current;
      if (!selected) throw new Error("selection");
      const next = toggleEntityFormat(selected, "text_link", parsed.toString());
      commitFormattedValue(next, selected.start, selected.end);
      setLinkOpen(false);
      savedLinkSelectionRef.current = null;
    } catch {
      setLinkError("Masukkan URL HTTPS yang valid tanpa username atau password.");
    }
  }

  const previewHtml = telegramRichTextToSafeHtml(value);
  const invalidLength = (required || value.text.length > 0) && (
    value.text.length < minLength || value.text.length > maxLength
  );
  const toolbarDisabled = previewMode === "toggle" && activeView === "preview";
  const audienceLabel = audience === "public"
    ? "Publik"
    : audience === "private"
      ? "Privat pembeli"
      : "Pesan admin";

  return (
    <div className="telegram-rich-editor-field">
      <div className="telegram-rich-editor-label">
        <div>
          <strong id={`${editorId}-label`}>{label}</strong>
          <span className={`telegram-rich-audience audience-${audience}`}>{audienceLabel}</span>
        </div>
        <span className={invalidLength ? "is-invalid" : ""}>{value.text.length}/{maxLength}</span>
      </div>
      {helpText ? <p className="telegram-rich-help" id={helperId}>{helpText}</p> : null}
      <textarea
        aria-hidden="true"
        className="telegram-rich-native-field"
        maxLength={maxLength}
        minLength={minLength}
        name={name}
        required={required}
        tabIndex={-1}
        value={value.text}
        onChange={() => undefined}
        onInvalid={(event) => {
          event.preventDefault();
          onInvalid?.();
          requestAnimationFrame(() => editorRef.current?.focus());
        }}
      />
      <input name={entitiesName} type="hidden" value={JSON.stringify(value.entities)} />
      <div aria-label={`Toolbar ${label}`} className="telegram-rich-toolbar" role="toolbar">
        <button aria-label="Bold" disabled={toolbarDisabled} title="Bold" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyEntityFormat("bold")}><Bold aria-hidden="true" size={16} /></button>
        <button aria-label="Italic" disabled={toolbarDisabled} title="Italic" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyEntityFormat("italic")}><Italic aria-hidden="true" size={16} /></button>
        <button aria-label="Underline" disabled={toolbarDisabled} title="Underline" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyEntityFormat("underline")}><Underline aria-hidden="true" size={16} /></button>
        <button aria-label="Coret" disabled={toolbarDisabled} title="Strikethrough" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyEntityFormat("strikethrough")}><Strikethrough aria-hidden="true" size={16} /></button>
        <button aria-label="Spoiler" disabled={toolbarDisabled} title="Spoiler" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyEntityFormat("spoiler")}><ShieldQuestion aria-hidden="true" size={16} /></button>
        <button aria-label="Code" disabled={toolbarDisabled} title="Inline code" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyEntityFormat("code")}><Braces aria-hidden="true" size={16} /></button>
        <button aria-label="Link" disabled={toolbarDisabled} title="Link HTTPS" type="button" onMouseDown={(event) => event.preventDefault()} onClick={openLink}><Link2 aria-hidden="true" size={16} /></button>
        <button aria-label="Kutipan" disabled={toolbarDisabled} title="Blockquote" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyEntityFormat("blockquote")}><MessageSquareQuote aria-hidden="true" size={16} /></button>
        <button aria-label="Bullet list" disabled={toolbarDisabled} title="Bullet list" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyListFormat("unordered")}><List aria-hidden="true" size={16} /></button>
        <button aria-label="Numbered list" disabled={toolbarDisabled} title="Numbered list" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyListFormat("ordered")}><ListOrdered aria-hidden="true" size={16} /></button>
        <button aria-label="Hapus format" disabled={toolbarDisabled} title="Hapus format" type="button" onMouseDown={(event) => event.preventDefault()} onClick={clearFormatting}><RemoveFormatting aria-hidden="true" size={16} /></button>
      </div>
      {previewMode === "toggle" ? (
        <div className="telegram-rich-view-toggle" role="tablist" aria-label={`Mode ${label}`}>
          <button aria-selected={activeView === "write"} className={activeView === "write" ? "is-active" : ""} role="tab" type="button" onClick={() => setActiveView("write")}><PenLine aria-hidden="true" size={15} /> Tulis</button>
          <button aria-selected={activeView === "preview"} className={activeView === "preview" ? "is-active" : ""} role="tab" type="button" onClick={() => setActiveView("preview")}><Eye aria-hidden="true" size={15} /> Preview</button>
        </div>
      ) : null}
      <div className={`telegram-rich-workbench mode-${previewMode}`}>
        <div
          ref={editorRef}
          aria-describedby={helpText ? helperId : undefined}
          aria-invalid={invalidLength || Boolean(editorError)}
          aria-labelledby={`${editorId}-label`}
          aria-multiline="true"
          className={`telegram-rich-editor${previewMode === "toggle" && activeView !== "write" ? " is-hidden" : ""}`}
          contentEditable
          data-placeholder={placeholder}
          id={editorId}
          role="textbox"
          suppressContentEditableWarning
          onBlur={syncValue}
          onInput={syncValue}
          onKeyDown={(event) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
            const shortcut = event.key.toLowerCase();
            if (shortcut === "b" || shortcut === "i" || shortcut === "u") {
              event.preventDefault();
              applyEntityFormat(shortcut === "b" ? "bold" : shortcut === "i" ? "italic" : "underline");
            }
          }}
        />
        <div className={`telegram-rich-preview${previewMode === "toggle" && activeView !== "preview" ? " is-hidden" : ""}`}>
          <small>Preview Telegram</small>
          {value.text ? (
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <p>{placeholder}</p>
          )}
        </div>
      </div>
      {editorError ? <p className="field-error">{editorError}</p> : null}
      {invalidLength && value.text.length > 0 ? (
        <p className="field-error">Panjang teks harus {minLength}-{maxLength} karakter.</p>
      ) : null}

      {linkOpen ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section aria-labelledby={linkTitleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div><p className="eyebrow">Telegram link</p><h2 id={linkTitleId}>Tambahkan link</h2></div>
              <button aria-label="Tutup link" className="modal-close" type="button" onClick={() => setLinkOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <label>
              URL HTTPS
              <input autoFocus value={linkUrl} type="url" onChange={(event) => setLinkUrl(event.target.value)} />
            </label>
            {linkError ? <p className="field-error">{linkError}</p> : null}
            <div className="admin-modal-actions">
              <button className="button button-primary" type="button" onClick={applyLink}><Link2 aria-hidden="true" size={16} /> Terapkan link</button>
              <button className="button button-ghost" type="button" onClick={() => setLinkOpen(false)}>Batal</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
