import { describe, expect, it } from "vitest";
import {
  isPrivateTelegramChatId,
  telegramNotificationPrivateChatBlockReason,
} from "@/server/telegram/chat-safety";

describe("Telegram notification chat safety", () => {
  it("recognizes only positive numeric user chat IDs as private", () => {
    expect(isPrivateTelegramChatId("7398144015")).toBe(true);
    expect(isPrivateTelegramChatId("-1004339051068")).toBe(false);
    expect(isPrivateTelegramChatId("@public_channel")).toBe(false);
  });

  it("blocks customer notifications from groups and channels", () => {
    expect(telegramNotificationPrivateChatBlockReason({
      kind: "DIGITAL_FILE",
      chatId: "-1004339051068",
    })).toContain("non-private");
    expect(telegramNotificationPrivateChatBlockReason({
      kind: "PRODUCT_POST_DELIVERY",
      chatId: "@public_channel",
    })).toContain("non-private");
  });

  it("allows only explicit public/admin notification kinds outside private chats", () => {
    expect(telegramNotificationPrivateChatBlockReason({
      kind: "SUCCESS_CHANNEL",
      chatId: "-1004339051068",
    })).toBeNull();
    expect(telegramNotificationPrivateChatBlockReason({
      kind: "SYSTEM_ALERT",
      chatId: "-1001234567890",
    })).toBeNull();
  });
});
