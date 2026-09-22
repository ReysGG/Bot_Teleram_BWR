import type { TelegramMessageEntity } from "@/server/telegram/api";
import {
  buildTelegramCustomEmojiPresentationTransform,
  type TelegramCustomEmojiInsertion,
  type TelegramCustomEmojiKey,
  type TelegramCustomEmojiSettings,
} from "@/server/telegram/custom-emoji";

export type TelegramEntityMatcher = string | RegExp;

export type TelegramMessageDocument = {
  text: string;
  entities: TelegramMessageEntity[];
};

type TelegramMessageFormatInput = {
  text: string;
  customEmojiSettings: TelegramCustomEmojiSettings;
  emojiKeys?: readonly TelegramCustomEmojiKey[];
  bold?: readonly TelegramEntityMatcher[];
  code?: readonly TelegramEntityMatcher[];
};

function matcherSpans(text: string, matcher: TelegramEntityMatcher) {
  if (typeof matcher === "string") {
    if (!matcher) return [];
    const spans: Array<{ offset: number; length: number }> = [];
    let offset = text.indexOf(matcher);
    while (offset >= 0) {
      spans.push({ offset, length: matcher.length });
      offset = text.indexOf(matcher, offset + matcher.length);
    }
    return spans;
  }

  const flags = matcher.flags.includes("g") ? matcher.flags : `${matcher.flags}g`;
  const expression = new RegExp(matcher.source, flags);
  const spans: Array<{ offset: number; length: number }> = [];
  for (const match of text.matchAll(expression)) {
    const wholeMatch = match[0];
    const selected = match.slice(1).find((capture) => capture !== undefined) ?? wholeMatch;
    if (!selected) continue;
    const relativeOffset = wholeMatch.indexOf(selected);
    spans.push({
      offset: (match.index ?? 0) + Math.max(0, relativeOffset),
      length: selected.length,
    });
  }
  return spans;
}

function formattingEntities(
  text: string,
  type: "bold" | "code",
  matchers: readonly TelegramEntityMatcher[],
) {
  const seen = new Set<string>();
  return matchers.flatMap((matcher) =>
    matcherSpans(text, matcher).flatMap((span) => {
      const key = `${type}:${span.offset}:${span.length}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ type, ...span } satisfies TelegramMessageEntity];
    }),
  );
}

function insertedLengthBefore(
  offset: number,
  insertions: readonly TelegramCustomEmojiInsertion[],
  includeAtOffset: boolean,
) {
  return insertions.reduce(
    (total, insertion) => total + (
      insertion.originalOffset < offset ||
      (includeAtOffset && insertion.originalOffset === offset)
        ? insertion.length
        : 0
    ),
    0,
  );
}

function projectFormattingEntity(
  entity: TelegramMessageEntity,
  insertions: readonly TelegramCustomEmojiInsertion[],
): TelegramMessageEntity[] {
  const entityEnd = entity.offset + entity.length;
  const internalInsertions = insertions.filter(
    (insertion) =>
      insertion.originalOffset > entity.offset &&
      insertion.originalOffset < entityEnd,
  );
  const boundaries = [
    entity.offset,
    ...internalInsertions.map((insertion) => insertion.originalOffset),
    entityEnd,
  ];
  const projected: TelegramMessageEntity[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end <= start) continue;
    const projectedStart = start + insertedLengthBefore(start, insertions, true);
    const projectedEnd = end + insertedLengthBefore(end, insertions, false);
    if (projectedEnd <= projectedStart) continue;
    projected.push({
      ...entity,
      offset: projectedStart,
      length: projectedEnd - projectedStart,
    });
  }
  return projected;
}

export function formatTelegramMessage(
  input: TelegramMessageFormatInput,
): TelegramMessageDocument {
  const presentation = buildTelegramCustomEmojiPresentationTransform(
    input.text,
    input.customEmojiSettings,
    input.emojiKeys,
  );
  const originalCodeEntities = formattingEntities(
    input.text,
    "code",
    input.code ?? [],
  );
  // Telegram does not allow bold/italic entities to overlap a code span.
  const originalBoldEntities = formattingEntities(
    input.text,
    "bold",
    input.bold ?? [],
  ).filter((bold) =>
    originalCodeEntities.every(
      (code) =>
        bold.offset + bold.length <= code.offset ||
        code.offset + code.length <= bold.offset,
    ),
  );
  const codeEntities = originalCodeEntities.flatMap((entity) =>
    projectFormattingEntity(entity, presentation.insertions),
  );
  const boldEntities = originalBoldEntities.flatMap((entity) =>
    projectFormattingEntity(entity, presentation.insertions),
  );
  const entities: TelegramMessageEntity[] = [
    ...presentation.entities,
    ...boldEntities,
    ...codeEntities,
  ];
  entities.sort(
    (left, right) =>
      left.offset - right.offset ||
      (left.type === "custom_emoji" ? -1 : right.type === "custom_emoji" ? 1 : 0),
  );
  return { text: presentation.text, entities };
}

export function composeTelegramMessageDocuments(
  parts: readonly TelegramMessageDocument[],
): TelegramMessageDocument {
  let text = "";
  const entities: TelegramMessageEntity[] = [];
  for (const part of parts) {
    entities.push(
      ...part.entities.map((entity) => ({ ...entity, offset: entity.offset + text.length })),
    );
    text += part.text;
  }
  return { text, entities };
}

export const PRODUCT_MESSAGE_EMOJI_KEYS = [
  "catalog",
  "product",
] as const satisfies readonly TelegramCustomEmojiKey[];

export const PRODUCT_MESSAGE_CODE_PATTERNS = [
  /\b(Rp\d[\d.]*)\b/g,
  /(?:Invoice:\s*|🧾\s*)([A-Z0-9][A-Z0-9-]{3,})/gi,
] as const;
