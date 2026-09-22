import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  compareCheckoutAvailability,
  type CheckoutAvailability,
} from "@/server/preorder/policy";
import { getMaintenanceState } from "@/server/store/maintenance";
import type { InlineKeyboard } from "@/server/telegram/api";
import { CATALOG_PAGE_SIZE } from "@/server/telegram/constants";
import {
  customEmojiIdForKey,
  firstCustomEmojiId,
  getTelegramCustomEmojiSettings,
} from "@/server/telegram/custom-emoji";
import { formatTelegramMessage } from "@/server/telegram/message-formatter";
import { productDisplayName } from "@/server/telegram/product-presentation";
import { catalogCopy } from "@/server/telegram/catalog-copy";
import { normalizeTelegramLocale } from "@/server/telegram/i18n";
import {
  clearPendingQuantity,
  parsePendingMessage,
} from "@/server/telegram/session-state";
import type { PendingProductSearch } from "@/server/telegram/types";
import { formatRupiah } from "@/server/utils/format";
import {
  availabilityEmoji,
  availabilityButtonStyle,
  groupCatalogOffer,
  productAvailabilityById,
} from "./availability";
import {
  catalogProductNumber,
  catalogSelectionPayload,
  type CatalogNumberedItem,
} from "./selection";
import type {
  CatalogNavigationRenderer,
  CatalogSearchInput,
} from "./types";

type RankedCatalogEntry = {
  key: string;
  kind: "GROUP" | "PRODUCT";
  id: string;
  name: string;
  price: number;
  variantCount: number;
  createdAt: Date;
  sortOrder: number;
  availability: CheckoutAvailability;
};

function catalogSearchWhere(search: string): Prisma.ProductWhereInput {
  const visibility: Prisma.ProductWhereInput = {
    OR: [
      { groupId: null },
      { group: { is: { status: "ACTIVE" } } },
    ],
  };
  if (!search) return visibility;
  return {
    AND: [
      visibility,
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { variantLabel: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { descriptionEn: { contains: search, mode: "insensitive" } },
          { group: { is: { name: { contains: search, mode: "insensitive" } } } },
          { group: { is: { description: { contains: search, mode: "insensitive" } } } },
          { group: { is: { descriptionEn: { contains: search, mode: "insensitive" } } } },
        ],
      },
    ],
  };
}

export async function showCatalog(
  render: CatalogNavigationRenderer,
  chatId: string,
  messageId?: number,
  page = 1,
  searchQuery?: string | null,
) {
  const search = searchQuery?.trim().slice(0, 50) || "";
  const [catalogProducts, maintenance, customEmojiSettings, session] = await Promise.all([
    prisma.product.findMany({
      where: {
        status: "ACTIVE",
        ...catalogSearchWhere(search),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        price: true,
        createdAt: true,
        groupId: true,
        groupSortOrder: true,
        preorderEnabled: true,
        preorderLimit: true,
        group: {
          select: {
            id: true,
            name: true,
            sortOrder: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            orderItems: {
              where: {
                stockItemId: null,
                order: {
                  isPreorder: true,
                  status: { in: ["PENDING_PAYMENT", "PAID_WAITING_STOCK"] },
                },
              },
            },
          },
        },
      },
    }),
    getMaintenanceState(),
    getTelegramCustomEmojiSettings(),
    prisma.botSession.findUnique({ where: { chatId }, select: { locale: true } }),
  ]);
  const locale = normalizeTelegramLocale(session?.locale);
  const copy = catalogCopy(locale);
  const availabilityByProduct = await productAvailabilityById(catalogProducts);
  const entries: RankedCatalogEntry[] = [];
  const grouped = new Map<string, typeof catalogProducts>();

  for (const product of catalogProducts) {
    if (!product.group) {
      const availability = availabilityByProduct.get(product.id);
      if (!availability) continue;
      entries.push({
        key: `product:${product.id}`,
        kind: "PRODUCT",
        id: product.id,
        name: product.name,
        price: product.price,
        variantCount: 1,
        createdAt: product.createdAt,
        sortOrder: 0,
        availability: availability.availability,
      });
      continue;
    }
    const products = grouped.get(product.group.id) ?? [];
    products.push(product);
    grouped.set(product.group.id, products);
  }

  for (const [groupId, products] of grouped) {
    const group = products[0].group!;
    const availableProducts = products
      .map((product) => ({
        product,
        availability: availabilityByProduct.get(product.id)?.availability,
      }))
      .filter(
        (value): value is { product: (typeof products)[number]; availability: CheckoutAvailability } =>
          Boolean(value.availability),
      );
    const offer = groupCatalogOffer(
      availableProducts.map((item) => ({
        price: item.product.price,
        availability: item.availability,
      })),
    );
    if (!offer) continue;
    entries.push({
      key: `group:${groupId}`,
      kind: "GROUP",
      id: groupId,
      name: group.name,
      price: offer.price,
      variantCount: products.length,
      createdAt: group.createdAt,
      sortOrder: group.sortOrder,
      availability: offer.availability,
    });
  }

  entries.sort(
    (left, right) =>
      compareCheckoutAvailability(left.availability, right.availability) ||
      left.sortOrder - right.sortOrder ||
      right.createdAt.getTime() - left.createdAt.getTime(),
  );

  const totalItems = entries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / CATALOG_PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const pageEntries = entries.slice(
    (currentPage - 1) * CATALOG_PAGE_SIZE,
    currentPage * CATALOG_PAGE_SIZE,
  );
  const numberedEntries = pageEntries.map((entry, index) => ({
    ...entry,
    catalogNumber: catalogProductNumber(currentPage, CATALOG_PAGE_SIZE, index),
  }));

  if (pageEntries.length === 0) {
    const emptyText = search
        ? `🔎 ${copy.productNotFound(search)}`
        : `🛍️ ${copy.noActiveProduct}`;
    const presentation = formatTelegramMessage({
      text: emptyText,
      customEmojiSettings,
      emojiKeys: search ? ["search"] : ["catalog"],
      bold: [emptyText.replace(/^[^\p{L}\p{N}]+/u, "")],
    });
    await render({
      chatId,
      messageId,
      ...presentation,
      replyMarkup: {
        inline_keyboard: [
          [{
            text: `🔎 ${copy.searchAgain}`,
            callback_data: "catalog_search",
            ...(customEmojiIdForKey(customEmojiSettings, "search")
              ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "search") }
              : {}),
          }],
          [{
            text: `⬅️ ${copy.back}`,
            callback_data: "menu",
            ...(customEmojiIdForKey(customEmojiSettings, "back")
              ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "back") }
              : {}),
          }],
        ],
      },
    });
    return;
  }

  const pageCallback = search ? "catalog_search_page" : "catalog";
  const pagination = [
    ...(currentPage > 1
      ? [{ text: "⬅️", callback_data: `${pageCallback}:${currentPage - 1}` }]
      : []),
    { text: `${currentPage}/${totalPages}`, callback_data: `${pageCallback}:${currentPage}` },
    ...(currentPage < totalPages
      ? [{ text: "➡️", callback_data: `${pageCallback}:${currentPage + 1}` }]
      : []),
  ];
  const keyboard: InlineKeyboard = {
    inline_keyboard: [
      ...numberedEntries.map((entry) => {
        const displayName = productDisplayName(entry.name);
        const productEmojiId = firstCustomEmojiId(
          entry.name,
          customEmojiSettings,
          "product",
        );
        return [{
          text: entry.kind === "GROUP"
            ? `${entry.catalogNumber}. ${availabilityEmoji(entry.availability, maintenance.enabled)} ${displayName} · ${copy.categoryOffer(entry.variantCount, formatRupiah(entry.price))}`
            : `${entry.catalogNumber}. ${availabilityEmoji(entry.availability, maintenance.enabled)} ${displayName} · ${formatRupiah(entry.price)}`,
          callback_data: entry.kind === "GROUP" ? `group:${entry.id}` : `product:${entry.id}`,
          style: availabilityButtonStyle(entry.availability, maintenance.enabled),
          ...(productEmojiId ? { icon_custom_emoji_id: productEmojiId } : {}),
        }];
      }),
      pagination,
      [
        {
          text: `🔎 ${copy.searchProduct}`,
          callback_data: "catalog_search",
          ...(customEmojiIdForKey(customEmojiSettings, "search")
            ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "search") }
            : {}),
        },
        {
          text: `🏠 ${copy.menu}`,
          callback_data: "menu",
          ...(customEmojiIdForKey(customEmojiSettings, "home")
            ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "home") }
            : {}),
        },
      ],
    ],
  };
  const catalogText = maintenance.enabled
      ? `🔧 MAINTENANCE\n\n${maintenance.message}\n\n${copy.maintenanceCatalog}`
      : [
          search ? `🔎 ${copy.catalogResultsTitle(search)}` : `🛍️ ${copy.catalogTitle}`,
          "",
          copy.catalogCount(totalItems, `${currentPage}/${totalPages}`),
          `✅ ${copy.availabilityLegend}`,
          "",
          copy.catalogHint,
        ].join("\n");
  const presentation = formatTelegramMessage({
    text: catalogText,
    customEmojiSettings,
    emojiKeys: search ? [] : ["catalog"],
    bold: [maintenance.enabled
      ? "MAINTENANCE"
      : search
        ? copy.catalogResultsTitle(search)
        : copy.catalogTitle],
    code: [`${currentPage}/${totalPages}`],
  });
  const rendered = await render({
    chatId,
    messageId,
    ...presentation,
    replyMarkup: keyboard,
  });
  const items: CatalogNumberedItem[] = numberedEntries.map((entry) =>
    entry.kind === "GROUP"
      ? { number: entry.catalogNumber, kind: "GROUP", groupId: entry.id }
      : { number: entry.catalogNumber, productId: entry.id },
  );
  await prisma.botSession.upsert({
    where: { chatId },
    create: {
      chatId,
      state: "BROWSING",
      cart: catalogSelectionPayload({
        messageId: rendered.message_id,
        page: currentPage,
        searchQuery: search || null,
        items,
      }),
      catalogSearchQuery: search || null,
    },
    update: {
      state: "BROWSING",
      cart: catalogSelectionPayload({
        messageId: rendered.message_id,
        page: currentPage,
        searchQuery: search || null,
        items,
      }),
      catalogSearchQuery: search || null,
    },
  });
}

export async function showCatalogSearchPrompt(
  render: CatalogNavigationRenderer,
  chatId: string,
  messageId?: number,
) {
  const [customEmojiSettings, session] = await Promise.all([
    getTelegramCustomEmojiSettings(),
    prisma.botSession.findUnique({ where: { chatId }, select: { locale: true } }),
  ]);
  const copy = catalogCopy(normalizeTelegramLocale(session?.locale));
  const presentation = formatTelegramMessage({
    text: `🔎 ${copy.searchPrompt}`,
    customEmojiSettings,
    emojiKeys: ["search"],
    bold: [copy.searchProduct],
    code: ["ChatGPT", "Codex", "K12"],
  });
  const rendered = await render({
    chatId,
    messageId,
    ...presentation,
    replyMarkup: {
      inline_keyboard: [[{
        text: `⬅️ ${copy.catalog}`,
        callback_data: "catalog:1",
        ...(customEmojiIdForKey(customEmojiSettings, "back")
          ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "back") }
          : {}),
      }]],
    },
  });
  await prisma.botSession.upsert({
    where: { chatId },
    create: {
      chatId,
      state: "AWAITING_PRODUCT_SEARCH",
      cart: { messageId: rendered.message_id },
      catalogSearchQuery: null,
    },
    update: {
      state: "AWAITING_PRODUCT_SEARCH",
      cart: { messageId: rendered.message_id },
      catalogSearchQuery: null,
    },
  });
}

export async function handleCatalogSearchInput(
  render: CatalogNavigationRenderer,
  input: CatalogSearchInput,
) {
  const pending = parsePendingMessage(input.cart) as PendingProductSearch | null;
  if (!pending) {
    await clearPendingQuantity(input.chatId);
    return showCatalog(render, input.chatId);
  }
  if (input.text.length < 2 || input.text.length > 50) {
    const session = await prisma.botSession.findUnique({
      where: { chatId: input.chatId },
      select: { locale: true },
    });
    const copy = catalogCopy(normalizeTelegramLocale(session?.locale));
    await render({
      chatId: input.chatId,
      messageId: pending.messageId,
      text: `❌ ${copy.invalidSearch}`,
      replyMarkup: {
        inline_keyboard: [[{ text: `⬅️ ${copy.catalog}`, callback_data: "catalog:1" }]],
      },
    });
    return;
  }
  await prisma.botSession.updateMany({
    where: { chatId: input.chatId },
    data: {
      state: "BROWSING",
      cart: Prisma.JsonNull,
      catalogSearchQuery: input.text.slice(0, 50),
    },
  });
  return showCatalog(render, input.chatId, pending.messageId, 1, input.text);
}
