import { describe, expect, it } from "vitest";
import {
  buildBrandCustomEmojiPresentation,
  buildTelegramCustomEmojiPresentation,
  customEmojiIdForKey,
  detectTelegramCustomEmojiBrands,
  extractCustomEmojiId,
  firstBrandCustomEmojiId,
  getTelegramCustomEmojiSettings,
  isTelegramCustomEmojiId,
  normalizeTelegramCustomEmojiId,
  setTelegramCustomEmojiId,
  type TelegramCustomEmojiSettings,
} from "@/server/telegram/custom-emoji";

const settings: TelegramCustomEmojiSettings = {
  chatgptCustomEmojiId: "5368324170671202286",
  claudeCustomEmojiId: "5368324170671202287",
  updatedBy: null,
  updatedAt: null,
};

function settingsClient(row: Record<string, unknown> | null) {
  let upsertInput: unknown;
  const client = {
    storeRuntimeSetting: {
      findUnique: async () => row,
      upsert: async (input: unknown) => {
        upsertInput = input;
        return row;
      },
    },
  } as never;
  return { client, upsertInput: () => upsertInput };
}

describe("Telegram brand custom emoji", () => {
  it("detects aliases once and preserves their first appearance order", () => {
    expect(
      detectTelegramCustomEmojiBrands(
        "Claude and Anthropic can be used beside Codex, OpenAI, and GPT.",
      ),
    ).toEqual(["claude", "codex", "chatgpt"]);
    expect(detectTelegramCustomEmojiBrands("ChatGPT + Claude API")).toEqual([
      "chatgpt",
      "claude",
      "api",
    ]);
    expect(detectTelegramCustomEmojiBrands("Gemini only")).toEqual(["gemini"]);
  });

  it("returns the same brand matches across repeated calls", () => {
    expect(detectTelegramCustomEmojiBrands("ChatGPT + Claude")).toEqual([
      "chatgpt",
      "claude",
    ]);
    expect(detectTelegramCustomEmojiBrands("ChatGPT + Claude")).toEqual([
      "chatgpt",
      "claude",
    ]);
  });

  it("selects one button icon by brand display order", () => {
    expect(firstBrandCustomEmojiId("ChatGPT + Claude", settings)).toBe(
      settings.chatgptCustomEmojiId,
    );
    expect(firstBrandCustomEmojiId("Claude + ChatGPT", settings)).toBe(
      settings.claudeCustomEmojiId,
    );
    expect(firstBrandCustomEmojiId("ChatGPT + Claude", {
      ...settings,
      chatgptCustomEmojiId: null,
    })).toBe(settings.claudeCustomEmojiId);
  });

  it("validates digit-only IDs without converting them to unsafe numbers", () => {
    expect(isTelegramCustomEmojiId("5368324170671202286")).toBe(true);
    expect(normalizeTelegramCustomEmojiId(" 5368324170671202286 ")).toBe(
      "5368324170671202286",
    );
    expect(isTelegramCustomEmojiId(5368324170671202286n)).toBe(false);
    expect(() => normalizeTelegramCustomEmojiId("5368-3241")).toThrow(
      /digits only/,
    );
  });

  it("extracts the first valid custom emoji ID from Telegram entities", () => {
    expect(
      extractCustomEmojiId([
        { type: "bold" },
        { type: "custom_emoji", custom_emoji_id: "not-an-id" },
        { type: "custom_emoji", custom_emoji_id: "5368324170671202286" },
      ]),
    ).toBe("5368324170671202286");
    expect(extractCustomEmojiId(undefined)).toBeNull();
  });

  it("places each configured emoji before its brand with UTF-16 offsets", () => {
    expect(
      buildBrandCustomEmojiPresentation("Claude + ChatGPT package", settings),
    ).toEqual({
      text: "🧠 Claude + 🤖 ChatGPT package",
      entities: [
        {
          type: "custom_emoji",
          offset: 0,
          length: 2,
          custom_emoji_id: "5368324170671202287",
        },
        {
          type: "custom_emoji",
          offset: 12,
          length: 2,
          custom_emoji_id: "5368324170671202286",
        },
      ],
    });
  });

  it("reuses an existing matching fallback instead of duplicating it", () => {
    expect(
      buildBrandCustomEmojiPresentation("🤖 ChatGPT + Claude", settings),
    ).toEqual({
      text: "🤖 ChatGPT + 🧠 Claude",
      entities: [
        {
          type: "custom_emoji",
          offset: 0,
          length: 2,
          custom_emoji_id: "5368324170671202286",
        },
        {
          type: "custom_emoji",
          offset: 13,
          length: 2,
          custom_emoji_id: "5368324170671202287",
        },
      ],
    });
  });

  it("decorates a shared custom emoji ID only once across brand and UI matches", () => {
    const sharedId = settings.chatgptCustomEmojiId!;
    const result = buildTelegramCustomEmojiPresentation(
      "🧩 ChatGPT Codex JSON",
      {
        ...settings,
        emojiIds: {
          codex: sharedId,
          json: sharedId,
          product: sharedId,
        },
      },
      ["product"],
    );

    expect(
      result.entities.filter((entity) => entity.custom_emoji_id === sharedId),
    ).toHaveLength(1);
    expect(result.text).toContain("ChatGPT Codex JSON");
  });

  it("keeps text unchanged when no detected brand has a configured ID", () => {
    expect(
      buildBrandCustomEmojiPresentation("ChatGPT package", {
        ...settings,
        chatgptCustomEmojiId: null,
      }),
    ).toEqual({ text: "ChatGPT package", entities: [] });
  });

  it("limits reusable UI custom emoji to product and catalog identity", () => {
    const configured = {
      ...settings,
      emojiIds: {
        product: "100",
        catalog: "101",
        payment: "102",
      },
    };
    expect(customEmojiIdForKey(configured, "product")).toBe("100");
    expect(customEmojiIdForKey(configured, "catalog")).toBe("101");
    expect(customEmojiIdForKey(configured, "payment")).toBeUndefined();
  });

  it("loads nullable settings and dedicated audit metadata", async () => {
    const updatedAt = new Date("2026-08-25T01:00:00.000Z");
    const store = settingsClient({
      telegramChatgptCustomEmojiId: settings.chatgptCustomEmojiId,
      telegramClaudeCustomEmojiId: null,
      telegramCustomEmojiUpdatedBy: "telegram:7398144015",
      telegramCustomEmojiUpdatedAt: updatedAt,
    });
    await expect(
      getTelegramCustomEmojiSettings(store.client),
    ).resolves.toEqual({
      chatgptCustomEmojiId: settings.chatgptCustomEmojiId,
      claudeCustomEmojiId: null,
      emojiIds: {},
      updatedBy: "telegram:7398144015",
      updatedAt,
    });
  });

  it("upserts one validated brand ID without overwriting the other brand", async () => {
    const store = settingsClient(null);
    await setTelegramCustomEmojiId(
      {
        brand: "claude",
        id: "5368324170671202287",
        actor: "telegram:7398144015",
      },
      store.client,
    );
    expect(store.upsertInput()).toMatchObject({
      where: { id: "global" },
      create: {
        id: "global",
        telegramClaudeCustomEmojiId: "5368324170671202287",
        telegramCustomEmojiUpdatedBy: "telegram:7398144015",
        telegramCustomEmojiUpdatedAt: expect.any(Date),
      },
      update: {
        telegramClaudeCustomEmojiId: "5368324170671202287",
        telegramCustomEmojiUpdatedBy: "telegram:7398144015",
        telegramCustomEmojiUpdatedAt: expect.any(Date),
      },
    });
    expect(store.upsertInput()).not.toMatchObject({
      update: { telegramChatgptCustomEmojiId: expect.anything() },
    });
  });

  it("rejects an invalid ID before writing settings", async () => {
    const store = settingsClient(null);
    await expect(
      setTelegramCustomEmojiId(
        {
          brand: "chatgpt",
          id: "invalid-id",
          actor: "telegram:7398144015",
        },
        store.client,
      ),
    ).rejects.toThrow(/digits only/);
    expect(store.upsertInput()).toBeUndefined();
  });
});
