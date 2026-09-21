import { prisma } from "@/server/db/prisma";
import {
  clearPendingQuantity,
  completePendingQuantitySelection,
  parseQuantityCallback,
} from "@/server/telegram/session-state";
import { catalogCopy } from "@/server/telegram/catalog-copy";
import { telegramLocaleForChat } from "@/server/telegram/locale-store";
import {
  handleCatalogSearchInput,
  showCatalog,
  showCatalogSearchPrompt,
} from "./catalog";
import {
  isCatalogCallback,
  parseProductGroupCallback,
} from "./callbacks";
import { showProductGroup } from "./group";
import { showProduct } from "./product";
import {
  parseCatalogSelection,
  parseGroupSelection,
  selectedCatalogEntry,
  selectedGroupProduct,
} from "./selection";
import {
  handleQuantityInput,
  showCustomQuantityPrompt,
  showQuantityOptions,
} from "./quantity";
import type {
  CatalogCallbackInput,
  CatalogFlowDependencies,
} from "./types";

export { sellableHealthFilter } from "./stock";
export { isCatalogCallback, parseProductGroupCallback } from "./callbacks";

export function isProductCallback(data: string) {
  return (
    data.startsWith("product:") ||
    data.startsWith("buy:") ||
    data.startsWith("qty_custom:") ||
    data.startsWith("qty:")
  );
}

export function createCatalogProductFlow(deps: CatalogFlowDependencies) {
  return {
    showCatalog(chatId: string, messageId?: number, page = 1, searchQuery?: string | null) {
      return showCatalog(
        deps.renderNavigationMessage,
        chatId,
        messageId,
        page,
        searchQuery,
      );
    },
    async openCatalog(chatId: string) {
      await clearPendingQuantity(chatId);
      await prisma.botSession.updateMany({
        where: { chatId },
        data: { catalogSearchQuery: null },
      });
      await deps.beginNewNavigationBubble(chatId);
      return showCatalog(deps.renderNavigationMessage, chatId);
    },
    showCatalogSearchPrompt(chatId: string, messageId?: number) {
      return showCatalogSearchPrompt(deps.renderNavigationMessage, chatId, messageId);
    },
    showProduct(chatId: string, productId: string, messageId?: number) {
      return showProduct(deps.renderNavigationMessage, chatId, productId, messageId);
    },
    showProductGroup(chatId: string, groupId: string, messageId?: number, page = 1) {
      return showProductGroup(
        deps.renderNavigationMessage,
        chatId,
        groupId,
        messageId,
        page,
      );
    },
    showQuantityOptions(chatId: string, productId: string, messageId: number) {
      return showQuantityOptions(
        deps.renderNavigationMessage,
        chatId,
        productId,
        messageId,
      );
    },
    showCustomQuantityPrompt(chatId: string, productId: string, messageId: number) {
      return showCustomQuantityPrompt(
        deps.renderNavigationMessage,
        chatId,
        productId,
        messageId,
      );
    },
    handleSearchInput(input: Parameters<typeof handleCatalogSearchInput>[1]) {
      return handleCatalogSearchInput(deps.renderNavigationMessage, input);
    },
    handleQuantityInput(input: Parameters<typeof handleQuantityInput>[1]) {
      return handleQuantityInput(deps, input);
    },
    async handleNumberInput(input: {
      chatId: string;
      text: string;
      cart: unknown;
    }) {
      const catalogSelection = parseCatalogSelection(input.cart);
      const groupSelection = parseGroupSelection(input.cart);
      if ((!catalogSelection && !groupSelection) || !/^\d+$/.test(input.text)) {
        return false;
      }
      const selection = catalogSelection ?? groupSelection!;
      const selected = catalogSelection
        ? selectedCatalogEntry(catalogSelection, input.text)
        : selectedGroupProduct(groupSelection!, input.text);
      if (!selected) {
        const copy = catalogCopy(await telegramLocaleForChat(input.chatId));
        const pageCallback = groupSelection
          ? `group_page:${groupSelection.groupId}`
          : catalogSelection!.searchQuery
            ? "catalog_search_page"
            : "catalog";
        await deps.renderNavigationMessage({
          chatId: input.chatId,
          messageId: selection.messageId,
          text: [
            `❌ ${copy.invalidSelection}`,
            "",
            copy.chooseNumbers(selection.items.map((item) => item.number).join(", ")),
          ].join("\n"),
          replyMarkup: {
            inline_keyboard: [[{
              text: groupSelection
                ? `⬅️ ${copy.backToVariantList}`
                : `⬅️ ${copy.backToCatalog}`,
              callback_data: `${pageCallback}:${selection.page}`,
            }]],
          },
        });
        return true;
      }

      if ("groupId" in selected) {
        await showProductGroup(
          deps.renderNavigationMessage,
          input.chatId,
          selected.groupId,
          selection.messageId,
        );
        return true;
      }
      await showProduct(
        deps.renderNavigationMessage,
        input.chatId,
        selected.productId,
        selection.messageId,
      );
      return true;
    },
    async handleCatalogCallback(input: CatalogCallbackInput) {
      if (input.data === "catalog") {
        await prisma.botSession.updateMany({
          where: { chatId: input.chatId },
          data: { catalogSearchQuery: null },
        });
        await showCatalog(
          deps.renderNavigationMessage,
          input.chatId,
          input.messageId,
          1,
        );
        return;
      }
      if (input.data.startsWith("catalog:")) {
        await showCatalog(
          deps.renderNavigationMessage,
          input.chatId,
          input.messageId,
          Number.parseInt(input.data.slice("catalog:".length), 10) || 1,
        );
        return;
      }
      if (input.data === "catalog_search") {
        await showCatalogSearchPrompt(
          deps.renderNavigationMessage,
          input.chatId,
          input.messageId,
        );
        return;
      }
      if (input.data.startsWith("catalog_search_page:")) {
        const session = await prisma.botSession.findUnique({
          where: { chatId: input.chatId },
        });
        await showCatalog(
          deps.renderNavigationMessage,
          input.chatId,
          input.messageId,
          Number.parseInt(input.data.slice("catalog_search_page:".length), 10) || 1,
          session?.catalogSearchQuery,
        );
        return;
      }
      const groupSelection = parseProductGroupCallback(input.data);
      if (groupSelection) {
        await showProductGroup(
          deps.renderNavigationMessage,
          input.chatId,
          groupSelection.groupId,
          input.messageId,
          groupSelection.page,
        );
      }
    },
    async handleProductCallback(input: CatalogCallbackInput) {
      if (input.data.startsWith("product:")) {
        await showProduct(
          deps.renderNavigationMessage,
          input.chatId,
          input.data.slice("product:".length),
          input.messageId,
        );
        return;
      }
      if (input.data.startsWith("buy:")) {
        await showQuantityOptions(
          deps.renderNavigationMessage,
          input.chatId,
          input.data.slice("buy:".length),
          input.messageId,
        );
        return;
      }
      if (input.data.startsWith("qty_custom:")) {
        await showCustomQuantityPrompt(
          deps.renderNavigationMessage,
          input.chatId,
          input.data.slice("qty_custom:".length),
          input.messageId,
        );
        return;
      }
      if (input.data.startsWith("qty:")) {
        const selection = parseQuantityCallback(input.data, "qty:");
        await completePendingQuantitySelection(input.chatId);
        await deps.showPaymentOptions(
          input.chatId,
          selection.productId,
          input.user,
          selection.quantity,
          input.messageId,
        );
      }
    },
  };
}
