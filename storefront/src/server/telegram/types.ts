import type { Prisma } from "@/generated/prisma/client";
import type { TelegramDocument } from "@/server/telegram/api";
import type { SmsPoolCountryCategory } from "@/server/smspool/client";

export type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
};

export type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

export type TelegramMessageEntity = {
  type: string;
  offset: number;
  length: number;
  custom_emoji_id?: string;
};

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  entities?: TelegramMessageEntity[];
  document?: TelegramDocument;
  media_group_id?: string;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type PendingQuantitySelection = {
  productId: string;
  messageId: number;
  returnCallback?: string;
};

export type PendingSmsSearch = {
  messageId: number;
  countryServiceId?: number;
  countryCategory?: SmsPoolCountryCategory;
};

export type PendingProductSearch = { messageId: number };
export type PendingReferralCode = { messageId: number };
export type PendingUsdtTransactionHash = { orderId: string; messageId: number };
export type PendingBinanceOrderId = { orderId: string; messageId: number };

export type PendingMessage = { messageId: number };

export type JsonValue = Prisma.JsonValue | null;
