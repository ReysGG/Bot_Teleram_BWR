import { afterEach, describe, expect, it, vi } from "vitest";

const { extractCustomEmojiId, sendMessage, setTelegramCustomEmojiId } = vi.hoisted(
  () => ({
    extractCustomEmojiId: vi.fn(),
    sendMessage: vi.fn(),
    setTelegramCustomEmojiId: vi.fn(),
  }),
);

vi.mock("@/server/telegram/api", () => ({ sendMessage }));
vi.mock("@/server/telegram/custom-emoji", () => ({
  extractCustomEmojiId,
  isTelegramCustomEmojiKey: (value: unknown) =>
    typeof value === "string" &&
    ["chatgpt", "claude", "gemini", "catalog"].includes(value),
  setTelegramCustomEmojiId,
  TELEGRAM_CUSTOM_EMOJI_KEYS: ["chatgpt", "claude", "gemini", "catalog"],
}));

import {
  handleSetEmojiCommand,
  shouldHandleSetEmojiCommand,
} from "@/server/telegram/custom-emoji-command";

describe("Telegram custom emoji admin command", () => {
  afterEach(() => {
    extractCustomEmojiId.mockReset();
    sendMessage.mockReset();
    setTelegramCustomEmojiId.mockReset();
  });

  it("leaves /setemoji in the normal flow for non-admin users", () => {
    expect(shouldHandleSetEmojiCommand("/setemoji", false)).toBe(false);
    expect(shouldHandleSetEmojiCommand("/setemoji", true)).toBe(true);
  });

  it("shows help when the admin sends /setemoji without arguments", async () => {
    await handleSetEmojiCommand({ chatId: "123", text: "/setemoji" });

    expect(setTelegramCustomEmojiId).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      "123",
      expect.stringContaining("/setemoji chatgpt <custom emoji>"),
    );
  });

  it("rejects unsupported keys", async () => {
    await handleSetEmojiCommand({
      chatId: "123",
      text: "/setemoji unknown emoji",
    });

    expect(extractCustomEmojiId).not.toHaveBeenCalled();
    expect(setTelegramCustomEmojiId).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      "123",
      expect.stringContaining("belum didukung"),
    );
  });

  it("requires an actual custom emoji entity", async () => {
    extractCustomEmojiId.mockReturnValue(null);
    const entities = [{ type: "bot_command", offset: 0, length: 9 }];

    await handleSetEmojiCommand({
      chatId: "123",
      text: "/setemoji chatgpt emoji",
      entities,
    });

    expect(extractCustomEmojiId).toHaveBeenCalledWith(entities);
    expect(setTelegramCustomEmojiId).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      "123",
      expect.stringContaining("tidak terdeteksi"),
    );
  });

  it("stores ChatGPT custom emoji with a Telegram audit actor", async () => {
    extractCustomEmojiId.mockReturnValue("5368324170671202286");

    await handleSetEmojiCommand({
      chatId: "123",
      text: "/setemoji@store_bot ChatGPT emoji",
      entities: [{
        type: "custom_emoji",
        offset: 29,
        length: 2,
        custom_emoji_id: "5368324170671202286",
      }],
    });

    expect(setTelegramCustomEmojiId).toHaveBeenCalledWith({
      key: "chatgpt",
      id: "5368324170671202286",
      actor: "telegram:123",
    });
    expect(sendMessage).toHaveBeenCalledWith(
      "123",
      expect.stringContaining("ChatGPT berhasil disimpan"),
    );
  });

  it("reports a safe retry message when persistence fails", async () => {
    extractCustomEmojiId.mockReturnValue("5368324170671202286");
    setTelegramCustomEmojiId.mockRejectedValue(new Error("database detail"));

    await handleSetEmojiCommand({
      chatId: "123",
      text: "/setemoji claude emoji",
      entities: [{
        type: "custom_emoji",
        offset: 18,
        length: 2,
        custom_emoji_id: "5368324170671202286",
      }],
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "123",
      "Custom emoji Claude gagal disimpan. Silakan coba lagi.",
    );
  });

  it("stores a reusable UI emoji key", async () => {
    extractCustomEmojiId.mockReturnValue("5319204558147188648");

    await handleSetEmojiCommand({
      chatId: "123",
      text: "/setemoji catalog emoji",
      entities: [{
        type: "custom_emoji",
        offset: 18,
        length: 2,
        custom_emoji_id: "5319204558147188648",
      }],
    });

    expect(setTelegramCustomEmojiId).toHaveBeenCalledWith({
      key: "catalog",
      id: "5319204558147188648",
      actor: "telegram:123",
    });
  });

  it("allows an admin to disable one configured key", async () => {
    await handleSetEmojiCommand({
      chatId: "123",
      text: "/setemoji catalog off",
    });

    expect(extractCustomEmojiId).not.toHaveBeenCalled();
    expect(setTelegramCustomEmojiId).toHaveBeenCalledWith({
      key: "catalog",
      id: null,
      actor: "telegram:123",
    });
    expect(sendMessage).toHaveBeenCalledWith(
      "123",
      "Custom emoji Katalog dinonaktifkan.",
    );
  });
});
