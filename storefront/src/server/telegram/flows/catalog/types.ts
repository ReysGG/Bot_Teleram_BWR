import type {
  InlineKeyboard,
  TelegramMessageEntity,
} from "@/server/telegram/api";
import type { JsonValue, TelegramUser } from "@/server/telegram/types";

export type CatalogNavigationRenderer = (input: {
  chatId: string;
  text: string;
  replyMarkup?: InlineKeyboard;
  entities?: readonly TelegramMessageEntity[];
  messageId?: number;
  photoUrl?: string | null;
}) => Promise<{ message_id: number }>;

export type CatalogFlowDependencies = {
  renderNavigationMessage: CatalogNavigationRenderer;
  beginNewNavigationBubble: (chatId: string) => Promise<void>;
  showMenu: (chatId: string) => Promise<unknown>;
  showPaymentOptions: (
    chatId: string,
    productId: string,
    user: TelegramUser,
    quantity: number,
    messageId?: number,
  ) => Promise<unknown>;
};

export type CatalogSearchInput = {
  chatId: string;
  text: string;
  cart: JsonValue;
};

export type QuantityInput = CatalogSearchInput & {
  user?: TelegramUser;
};

export type CatalogCallbackInput = {
  data: string;
  chatId: string;
  messageId: number;
  user: TelegramUser;
};
