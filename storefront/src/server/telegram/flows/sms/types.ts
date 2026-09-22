import type { InlineKeyboard } from "@/server/telegram/api";

export type SmsTelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type SmsNavigationRenderer = (input: {
  chatId: string;
  text: string;
  replyMarkup?: InlineKeyboard;
  messageId?: number;
}) => Promise<{ message_id: number }>;

export type SmsFlowDependencies = {
  renderNavigationMessage: SmsNavigationRenderer;
  beginNewNavigationBubble: (chatId: string) => Promise<void>;
};

export type PendingSmsSearch = {
  messageId: number;
  countryServiceId?: number;
  countryCategory?: "cheap" | "success";
};
