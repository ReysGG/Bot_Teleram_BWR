import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

const STORE_RUNTIME_ID = "global";

const BRAND_RULES = [
  {
    key: "claude",
    pattern: /\b(?:claude|anthropic)\b/i,
    fallbackEmoji: "🧠",
  },
  {
    key: "chatgpt",
    pattern: /\b(?:chatgpt|openai|gpt)\b/i,
    fallbackEmoji: "🤖",
  },
  { key: "codex", pattern: /\bcodex\b/i, fallbackEmoji: "⌨️" },
  {
    key: "gemini",
    pattern: /\b(?:gemini|google\s+ai)\b/i,
    fallbackEmoji: "✨",
  },
  { key: "canva", pattern: /\b(?:canva|design)\b/i, fallbackEmoji: "🎨" },
  { key: "sms", pattern: /\b(?:sms|otp|nomor)\b/i, fallbackEmoji: "📲" },
  { key: "json", pattern: /\b(?:json|9router)\b/i, fallbackEmoji: "📄" },
  { key: "api", pattern: /\bapi(?:\s+key)?\b/i, fallbackEmoji: "🔑" },
] as const;

const UI_EMOJI_FALLBACKS = {
  catalog: ["🛍️"],
  product: ["🧩"],
  cart: ["🛒"],
  stock: ["📦"],
  payment: ["💰", "💳", "💵"],
  delivery: ["📦", "📨"],
  success: ["✅"],
  search: ["🔎"],
  back: ["⬅️"],
  home: ["🏠"],
  warning: ["🚨", "❌", "🚫"],
  notification: ["🔔"],
  preorder: ["📥", "⏳"],
} as const;

export type TelegramCustomEmojiBrand = (typeof BRAND_RULES)[number]["key"];
export type TelegramCustomEmojiUiRole = keyof typeof UI_EMOJI_FALLBACKS;
export type TelegramCustomEmojiKey =
  | TelegramCustomEmojiBrand
  | TelegramCustomEmojiUiRole;

export const TELEGRAM_CUSTOM_EMOJI_KEYS = [
  ...BRAND_RULES.map((rule) => rule.key),
  ...Object.keys(UI_EMOJI_FALLBACKS) as TelegramCustomEmojiUiRole[],
] as const satisfies readonly TelegramCustomEmojiKey[];

const TELEGRAM_CUSTOM_EMOJI_KEY_SET = new Set<string>(
  TELEGRAM_CUSTOM_EMOJI_KEYS,
);
const PRESENTATION_UI_EMOJI_KEYS = new Set<TelegramCustomEmojiUiRole>([
  "catalog",
  "product",
]);

export type TelegramCustomEmojiSettings = {
  chatgptCustomEmojiId: string | null;
  claudeCustomEmojiId: string | null;
  emojiIds?: Partial<Record<TelegramCustomEmojiKey, string>>;
  updatedBy: string | null;
  updatedAt: Date | null;
};

export type TelegramCustomEmojiEntity = {
  type: "custom_emoji";
  offset: number;
  length: number;
  custom_emoji_id: string;
};

export type TelegramMessageEntityLike = {
  type: string;
  custom_emoji_id?: string;
};

export type TelegramCustomEmojiSettingClient = Pick<
  Prisma.TransactionClient,
  "storeRuntimeSetting"
>;

export function isTelegramCustomEmojiId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]+$/.test(value);
}

export function normalizeTelegramCustomEmojiId(value: string) {
  const normalized = value.trim();
  if (!isTelegramCustomEmojiId(normalized)) {
    throw new Error("Telegram custom emoji ID must contain digits only.");
  }
  return normalized;
}

export function isTelegramCustomEmojiKey(
  value: unknown,
): value is TelegramCustomEmojiKey {
  return (
    typeof value === "string" &&
    TELEGRAM_CUSTOM_EMOJI_KEY_SET.has(value.trim().toLowerCase())
  );
}

export function extractCustomEmojiId(
  entities: readonly TelegramMessageEntityLike[] | null | undefined,
) {
  const id = entities?.find(
    (entity) =>
      entity.type === "custom_emoji" &&
      isTelegramCustomEmojiId(entity.custom_emoji_id),
  )?.custom_emoji_id;
  return id ?? null;
}

function parsedEmojiMap(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Partial<Record<TelegramCustomEmojiKey, string>>;
  }
  const emojiIds: Partial<Record<TelegramCustomEmojiKey, string>> = {};
  for (const [rawKey, rawId] of Object.entries(value)) {
    if (isTelegramCustomEmojiKey(rawKey) && isTelegramCustomEmojiId(rawId)) {
      emojiIds[rawKey] = rawId;
    }
  }
  return emojiIds;
}

export function customEmojiIdForKey(
  settings: TelegramCustomEmojiSettings,
  key: TelegramCustomEmojiKey,
): string | undefined {
  // Keep premium decoration focused on product/category identity. Action and
  // status buttons remain plain Unicode so the checkout stays scannable.
  const isBrandKey = BRAND_RULES.some((rule) => rule.key === key);
  if (!isBrandKey && !PRESENTATION_UI_EMOJI_KEYS.has(key as TelegramCustomEmojiUiRole)) {
    return undefined;
  }
  const configured = settings.emojiIds?.[key];
  if (isTelegramCustomEmojiId(configured)) return configured;
  if (key === "chatgpt" && isTelegramCustomEmojiId(settings.chatgptCustomEmojiId)) {
    return settings.chatgptCustomEmojiId;
  }
  if (key === "claude" && isTelegramCustomEmojiId(settings.claudeCustomEmojiId)) {
    return settings.claudeCustomEmojiId;
  }
  // Older deployments treated Codex as part of the ChatGPT family.
  if (key === "codex") {
    return customEmojiIdForKey(settings, "chatgpt");
  }
  return undefined;
}

export function detectTelegramCustomEmojiBrands(
  text: string,
): TelegramCustomEmojiBrand[] {
  return BRAND_RULES.flatMap((rule) => {
    const match = rule.pattern.exec(text);
    return match ? [{ key: rule.key, index: match.index }] : [];
  })
    .sort((left, right) => left.index - right.index)
    .map(({ key }) => key);
}

export function firstBrandCustomEmojiId(
  text: string,
  settings: TelegramCustomEmojiSettings,
): string | undefined {
  for (const brand of detectTelegramCustomEmojiBrands(text)) {
    const customEmojiId = customEmojiIdForKey(settings, brand);
    if (customEmojiId) return customEmojiId;
  }
  return undefined;
}

export function firstCustomEmojiId(
  text: string,
  settings: TelegramCustomEmojiSettings,
  fallbackKey?: TelegramCustomEmojiKey,
) {
  return (
    firstBrandCustomEmojiId(text, settings) ??
    (fallbackKey ? customEmojiIdForKey(settings, fallbackKey) : undefined)
  );
}

function addFallbackEntities(
  text: string,
  settings: TelegramCustomEmojiSettings,
  keys: readonly TelegramCustomEmojiKey[],
  entities: TelegramCustomEmojiEntity[],
) {
  const occupiedOffsets = new Set(entities.map((entity) => entity.offset));
  const occupiedIds = new Set(
    entities.map((entity) => entity.custom_emoji_id),
  );
  for (const key of keys) {
    const customEmojiId = customEmojiIdForKey(settings, key);
    if (!customEmojiId || occupiedIds.has(customEmojiId)) continue;
    const brandRule = BRAND_RULES.find((rule) => rule.key === key);
    const fallbacks = brandRule
      ? [brandRule.fallbackEmoji]
      : UI_EMOJI_FALLBACKS[key as TelegramCustomEmojiUiRole];
    for (const fallback of fallbacks ?? []) {
      let offset = text.indexOf(fallback);
      while (offset >= 0) {
        if (!occupiedOffsets.has(offset)) {
          entities.push({
            type: "custom_emoji",
            offset,
            length: fallback.length,
            custom_emoji_id: customEmojiId,
          });
          occupiedOffsets.add(offset);
          occupiedIds.add(customEmojiId);
          break;
        }
        offset = text.indexOf(fallback, offset + fallback.length);
      }
      if (occupiedIds.has(customEmojiId)) break;
    }
  }
}

export type TelegramCustomEmojiInsertion = {
  originalOffset: number;
  presentedOffset: number;
  length: number;
};

export function buildTelegramCustomEmojiPresentationTransform(
  text: string,
  settings: TelegramCustomEmojiSettings,
  emojiKeys: readonly TelegramCustomEmojiKey[] = [],
): {
  text: string;
  entities: TelegramCustomEmojiEntity[];
  insertions: TelegramCustomEmojiInsertion[];
} {
  const seenCustomEmojiIds = new Set<string>();
  const configuredBrands = BRAND_RULES.flatMap((rule) => {
    const match = rule.pattern.exec(text);
    const customEmojiId = customEmojiIdForKey(settings, rule.key);
    return match && customEmojiId
      ? [{ customEmojiId, fallbackEmoji: rule.fallbackEmoji, index: match.index }]
      : [];
  })
    .sort((left, right) => left.index - right.index)
    .filter(({ customEmojiId }) => {
      if (seenCustomEmojiIds.has(customEmojiId)) return false;
      seenCustomEmojiIds.add(customEmojiId);
      return true;
    });
  let composedText = text;
  const entities: TelegramCustomEmojiEntity[] = [];
  const insertions: TelegramCustomEmojiInsertion[] = [];
  let insertedLength = 0;
  for (const configured of configuredBrands) {
    const precedingText = text.slice(0, configured.index);
    const fallbackIndex = precedingText.lastIndexOf(configured.fallbackEmoji);
    const hasExistingFallback =
      fallbackIndex >= 0 &&
      /^[ \t]*$/.test(
        precedingText.slice(fallbackIndex + configured.fallbackEmoji.length),
      );
    const entityOffset = hasExistingFallback
      ? fallbackIndex + insertedLength
      : configured.index + insertedLength;
    if (!hasExistingFallback) {
      const prefix = `${configured.fallbackEmoji} `;
      composedText =
        composedText.slice(0, entityOffset) +
        prefix +
        composedText.slice(entityOffset);
      insertions.push({
        originalOffset: configured.index,
        presentedOffset: entityOffset,
        length: prefix.length,
      });
      insertedLength += prefix.length;
    }
    entities.push({
      type: "custom_emoji",
      offset: entityOffset,
      length: configured.fallbackEmoji.length,
      custom_emoji_id: configured.customEmojiId,
    });
  }
  addFallbackEntities(composedText, settings, emojiKeys, entities);
  entities.sort((left, right) => left.offset - right.offset);
  return { text: composedText, entities, insertions };
}

export function buildTelegramCustomEmojiPresentation(
  text: string,
  settings: TelegramCustomEmojiSettings,
  emojiKeys: readonly TelegramCustomEmojiKey[] = [],
): { text: string; entities: TelegramCustomEmojiEntity[] } {
  const { insertions: _insertions, ...presentation } =
    buildTelegramCustomEmojiPresentationTransform(text, settings, emojiKeys);
  return presentation;
}

export function buildBrandCustomEmojiPresentation(
  text: string,
  settings: TelegramCustomEmojiSettings,
) {
  return buildTelegramCustomEmojiPresentation(text, settings);
}

export async function getTelegramCustomEmojiSettings(
  client: TelegramCustomEmojiSettingClient = prisma,
): Promise<TelegramCustomEmojiSettings> {
  const setting = await client.storeRuntimeSetting.findUnique({
    where: { id: STORE_RUNTIME_ID },
    select: {
      telegramChatgptCustomEmojiId: true,
      telegramClaudeCustomEmojiId: true,
      telegramCustomEmojiMap: true,
      telegramCustomEmojiUpdatedBy: true,
      telegramCustomEmojiUpdatedAt: true,
    },
  });
  return {
    chatgptCustomEmojiId: setting?.telegramChatgptCustomEmojiId ?? null,
    claudeCustomEmojiId: setting?.telegramClaudeCustomEmojiId ?? null,
    emojiIds: parsedEmojiMap(setting?.telegramCustomEmojiMap),
    updatedBy: setting?.telegramCustomEmojiUpdatedBy ?? null,
    updatedAt: setting?.telegramCustomEmojiUpdatedAt ?? null,
  };
}

export async function setTelegramCustomEmojiId(
  input: {
    brand?: TelegramCustomEmojiBrand;
    key?: TelegramCustomEmojiKey;
    id: string | null;
    actor: string;
  },
  client: TelegramCustomEmojiSettingClient = prisma,
) {
  const key = input.key ?? input.brand;
  if (!key || !isTelegramCustomEmojiKey(key)) {
    throw new Error("Unsupported Telegram custom emoji key.");
  }
  const customEmojiId =
    input.id === null ? null : normalizeTelegramCustomEmojiId(input.id);
  const current = await client.storeRuntimeSetting.findUnique({
    where: { id: STORE_RUNTIME_ID },
    select: { telegramCustomEmojiMap: true },
  });
  const emojiIds = parsedEmojiMap(current?.telegramCustomEmojiMap);
  if (customEmojiId) emojiIds[key] = customEmojiId;
  else delete emojiIds[key];
  const updatedAt = new Date();
  const legacyData =
    key === "chatgpt"
      ? { telegramChatgptCustomEmojiId: customEmojiId }
      : key === "claude"
        ? { telegramClaudeCustomEmojiId: customEmojiId }
        : {};
  const data = {
    ...legacyData,
    telegramCustomEmojiMap: emojiIds as Prisma.InputJsonValue,
    telegramCustomEmojiUpdatedBy: input.actor,
    telegramCustomEmojiUpdatedAt: updatedAt,
  };
  return client.storeRuntimeSetting.upsert({
    where: { id: STORE_RUNTIME_ID },
    create: { id: STORE_RUNTIME_ID, ...data },
    update: data,
  });
}
