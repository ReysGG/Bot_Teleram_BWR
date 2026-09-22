import type { InlineKeyboard, TelegramDocument } from "@/server/telegram/api";

export type RedeemDocumentMessage = {
  message_id: number;
  chat: { id: number };
  document?: TelegramDocument;
};

export type RedeemNavigationInput = {
  chatId: string;
  text: string;
  replyMarkup?: InlineKeyboard;
  messageId?: number;
};

export type RedeemFlowDependencies = {
  renderNavigationMessage: (
    input: RedeemNavigationInput,
  ) => Promise<{ message_id: number }>;
  showMenu: (
    chatId: string,
    messageId?: number,
    notice?: string,
  ) => Promise<unknown>;
};
