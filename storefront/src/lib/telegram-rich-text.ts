export const TELEGRAM_RICH_TEXT_TYPES = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "spoiler",
  "code",
  "blockquote",
  "text_link",
] as const;

export type TelegramRichTextType = (typeof TELEGRAM_RICH_TEXT_TYPES)[number];

export type TelegramRichTextEntity = {
  type: TelegramRichTextType;
  offset: number;
  length: number;
  url?: string;
};

export type TelegramRichTextDocument = {
  text: string;
  entities: TelegramRichTextEntity[];
};

const TYPE_SET = new Set<string>(TELEGRAM_RICH_TEXT_TYPES);
const INLINE_STYLE_TYPES = new Set<TelegramRichTextType>([
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "spoiler",
]);

export const MAX_TELEGRAM_RICH_TEXT_ENTITIES = 100;

export class TelegramRichTextInputError extends Error {}

function canonicalTelegramText(value: unknown) {
  return String(value ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function normalizeLink(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 2048) {
    throw new TelegramRichTextInputError("Link formatter tidak valid");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TelegramRichTextInputError("Link formatter tidak valid");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    throw new TelegramRichTextInputError(
      "Link formatter wajib memakai HTTPS tanpa username atau password",
    );
  }
  return parsed.toString();
}

function parseEntity(value: unknown): TelegramRichTextEntity {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TelegramRichTextInputError("Entity formatter tidak valid");
  }
  const candidate = value as Record<string, unknown>;
  const type = String(candidate.type ?? "");
  const offset = Number(candidate.offset);
  const length = Number(candidate.length);
  if (
    !TYPE_SET.has(type) ||
    !Number.isInteger(offset) ||
    !Number.isInteger(length) ||
    offset < 0 ||
    length <= 0
  ) {
    throw new TelegramRichTextInputError("Entity formatter tidak valid");
  }
  if (type === "text_link") {
    return {
      type,
      offset,
      length,
      url: normalizeLink(candidate.url),
    };
  }
  return { type: type as TelegramRichTextType, offset, length };
}

function isUtf16Boundary(text: string, index: number) {
  if (index <= 0 || index >= text.length) return true;
  const previous = text.charCodeAt(index - 1);
  const current = text.charCodeAt(index);
  const previousIsHighSurrogate = previous >= 0xd800 && previous <= 0xdbff;
  const currentIsLowSurrogate = current >= 0xdc00 && current <= 0xdfff;
  return !(previousIsHighSurrogate && currentIsLowSurrogate);
}

export function parseTelegramRichTextEntities(value: unknown) {
  if (value === undefined || value === null || value === "") return [];
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new TelegramRichTextInputError("Data formatter bukan JSON yang valid");
    }
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_TELEGRAM_RICH_TEXT_ENTITIES) {
    throw new TelegramRichTextInputError("Jumlah format Telegram tidak valid");
  }
  return parsed.map(parseEntity);
}

function trimDocument(document: TelegramRichTextDocument) {
  const leading = document.text.length - document.text.trimStart().length;
  const trailingEnd = document.text.trimEnd().length;
  const text = document.text.slice(leading, trailingEnd);
  const entities = document.entities.flatMap((entity) => {
    const start = Math.max(entity.offset, leading);
    const end = Math.min(entity.offset + entity.length, trailingEnd);
    if (end <= start) return [];
    return [{
      ...entity,
      offset: start - leading,
      length: end - start,
    }];
  });
  return { text, entities };
}

function overlaps(left: TelegramRichTextEntity, right: TelegramRichTextEntity) {
  return left.offset < right.offset + right.length &&
    right.offset < left.offset + left.length;
}

function contains(left: TelegramRichTextEntity, right: TelegramRichTextEntity) {
  return left.offset <= right.offset &&
    left.offset + left.length >= right.offset + right.length;
}

function validateEntityRelationships(entities: TelegramRichTextEntity[]) {
  for (let leftIndex = 0; leftIndex < entities.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entities.length; rightIndex += 1) {
      const left = entities[leftIndex];
      const right = entities[rightIndex];
      if (!overlaps(left, right)) continue;
      if (!contains(left, right) && !contains(right, left)) {
        throw new TelegramRichTextInputError("Format Telegram tidak boleh saling menyilang");
      }
      if (left.type === "code" || right.type === "code") {
        throw new TelegramRichTextInputError("Format code tidak boleh ditumpuk");
      }
      if (left.type === "blockquote" && right.type === "blockquote") {
        throw new TelegramRichTextInputError("Blockquote tidak boleh ditumpuk");
      }
      if (
        !INLINE_STYLE_TYPES.has(left.type) &&
        !INLINE_STYLE_TYPES.has(right.type) &&
        left.type !== "blockquote" &&
        right.type !== "blockquote"
      ) {
        throw new TelegramRichTextInputError("Link atau format khusus tidak boleh ditumpuk");
      }
    }
  }
}

function mergeAdjacentEntities(entities: TelegramRichTextEntity[]) {
  const sorted = [...entities].sort((left, right) =>
    left.type.localeCompare(right.type) ||
    String(left.url ?? "").localeCompare(String(right.url ?? "")) ||
    left.offset - right.offset ||
    left.length - right.length,
  );
  const merged: TelegramRichTextEntity[] = [];
  for (const entity of sorted) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.type === entity.type &&
      previous.url === entity.url &&
      previous.offset + previous.length === entity.offset
    ) {
      previous.length += entity.length;
      continue;
    }
    merged.push({ ...entity });
  }
  return merged.sort((left, right) =>
    left.offset - right.offset ||
    right.length - left.length ||
    left.type.localeCompare(right.type),
  );
}

export function normalizeTelegramRichTextDocument(input: {
  text: unknown;
  entities?: unknown;
  minLength?: number;
  maxLength: number;
}) {
  // HTML form submission may canonicalize textarea newlines to CRLF while the
  // editor calculates Telegram UTF-16 offsets against LF text.
  const rawText = canonicalTelegramText(input.text);
  const parsedEntities = parseTelegramRichTextEntities(input.entities);
  for (const entity of parsedEntities) {
    const end = entity.offset + entity.length;
    if (end > rawText.length) {
      throw new TelegramRichTextInputError("Offset formatter berada di luar teks");
    }
    if (!isUtf16Boundary(rawText, entity.offset) || !isUtf16Boundary(rawText, end)) {
      throw new TelegramRichTextInputError(
        "Offset formatter tidak boleh membelah karakter emoji",
      );
    }
  }
  const trimmed = trimDocument({
    text: rawText,
    entities: parsedEntities,
  });
  const minLength = input.minLength ?? 1;
  if (trimmed.text.length < minLength || trimmed.text.length > input.maxLength) {
    throw new TelegramRichTextInputError(
      `Panjang pesan wajib ${minLength}-${input.maxLength} karakter`,
    );
  }
  const entities = mergeAdjacentEntities(trimmed.entities);
  validateEntityRelationships(entities);
  return { text: trimmed.text, entities } satisfies TelegramRichTextDocument;
}

export function safeTelegramRichTextEntities(value: unknown, text: string) {
  try {
    return normalizeTelegramRichTextDocument({
      text: text || " ",
      entities: value,
      minLength: 1,
      maxLength: Math.max(1, text.length),
    }).entities;
  } catch {
    return [];
  }
}

export function shiftTelegramRichTextEntities(
  entities: readonly TelegramRichTextEntity[],
  offset: number,
) {
  return entities.map((entity) => ({ ...entity, offset: entity.offset + offset }));
}

function safeUtf16SliceEnd(text: string, requestedEnd: number) {
  let end = Math.max(0, Math.min(text.length, Math.trunc(requestedEnd)));
  if (end > 0 && end < text.length) {
    const previous = text.charCodeAt(end - 1);
    const current = text.charCodeAt(end);
    if (
      previous >= 0xd800 &&
      previous <= 0xdbff &&
      current >= 0xdc00 &&
      current <= 0xdfff
    ) {
      end -= 1;
    }
  }
  return end;
}

export function sliceTelegramRichTextDocument(
  document: TelegramRichTextDocument,
  maxLength: number,
): TelegramRichTextDocument {
  const end = safeUtf16SliceEnd(document.text, maxLength);
  if (end >= document.text.length) {
    return { text: document.text, entities: document.entities.map((entity) => ({ ...entity })) };
  }
  const text = document.text.slice(0, end).trimEnd();
  const finalEnd = text.length;
  const entities = document.entities.flatMap((entity) => {
    if (entity.offset >= finalEnd) return [];
    const entityEnd = Math.min(entity.offset + entity.length, finalEnd);
    if (entityEnd <= entity.offset) return [];
    return [{ ...entity, length: entityEnd - entity.offset }];
  });
  return normalizeTelegramRichTextDocument({
    text,
    entities,
    minLength: 0,
    maxLength: Math.max(1, finalEnd),
  });
}

export function composeTelegramRichText(
  parts: readonly TelegramRichTextDocument[],
): TelegramRichTextDocument {
  let text = "";
  const entities: TelegramRichTextEntity[] = [];
  for (const part of parts) {
    entities.push(...shiftTelegramRichTextEntities(part.entities, text.length));
    text += part.text;
  }
  return { text, entities };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const ENTITY_TAGS: Record<TelegramRichTextType, [string, string]> = {
  bold: ["<strong>", "</strong>"],
  italic: ["<em>", "</em>"],
  underline: ["<u>", "</u>"],
  strikethrough: ["<s>", "</s>"],
  spoiler: ['<span class="tg-rich-spoiler">', "</span>"],
  code: ["<code>", "</code>"],
  blockquote: ["<blockquote>", "</blockquote>"],
  text_link: ["", ""],
};

export function telegramRichTextToSafeHtml(document: TelegramRichTextDocument) {
  const boundaries = new Set([0, document.text.length]);
  document.entities.forEach((entity) => {
    boundaries.add(entity.offset);
    boundaries.add(entity.offset + entity.length);
  });
  const points = [...boundaries].sort((left, right) => left - right);
  let html = "";
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;
    const active = document.entities
      .filter((entity) => entity.offset <= start && entity.offset + entity.length >= end)
      .sort((left, right) =>
        right.length - left.length || left.type.localeCompare(right.type),
      );
    let fragment = escapeHtml(document.text.slice(start, end)).replaceAll("\n", "<br>");
    for (const entity of [...active].reverse()) {
      if (entity.type === "text_link") {
        fragment = `<a href="${escapeHtml(entity.url ?? "")}" target="_blank" rel="noreferrer">${fragment}</a>`;
      } else {
        const [open, close] = ENTITY_TAGS[entity.type];
        fragment = `${open}${fragment}${close}`;
      }
    }
    html += fragment;
  }
  return html;
}
