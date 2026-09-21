import { handleSmsCallback, type SmsCallbackInput } from "./callbacks";
import { handleSmsSearchInput, showSmsServices } from "./search";
import type { SmsFlowDependencies } from "./types";

export function createSmsTelegramFlow(deps: SmsFlowDependencies) {
  return {
    showServices(chatId: string, messageId?: number, page = 1) {
      return showSmsServices(deps.renderNavigationMessage, chatId, messageId, page);
    },
    handleSearchInput(input: { chatId: string; text: string; cart: Parameters<typeof handleSmsSearchInput>[0]["cart"] }) {
      return handleSmsSearchInput({
        render: deps.renderNavigationMessage,
        ...input,
      });
    },
    handleCallback(callback: SmsCallbackInput) {
      return handleSmsCallback(deps, callback);
    },
  };
}
