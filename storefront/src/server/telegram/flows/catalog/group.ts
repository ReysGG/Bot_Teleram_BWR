import { prisma } from "@/server/db/prisma";
import { compareCheckoutAvailability } from "@/server/preorder/policy";
import {
  catalogDescriptionDocument,
  localizedCatalogDescription,
} from "@/server/products/catalog-description";
import { telegramCatalogImageUrl } from "@/server/products/media";
import { getMaintenanceState } from "@/server/store/maintenance";
import type { InlineKeyboard } from "@/server/telegram/api";
import { PRODUCT_VARIANT_PAGE_SIZE } from "@/server/telegram/constants";
import {
  customEmojiIdForKey,
  firstBrandCustomEmojiId,
  firstCustomEmojiId,
  getTelegramCustomEmojiSettings,
  type TelegramCustomEmojiSettings,
} from "@/server/telegram/custom-emoji";
import {
  composeTelegramMessageDocuments,
  formatTelegramMessage,
  type TelegramMessageDocument,
} from "@/server/telegram/message-formatter";
import { productDisplayName } from "@/server/telegram/product-presentation";
import { catalogCopy } from "@/server/telegram/catalog-copy";
import { normalizeTelegramLocale, type TelegramLocale } from "@/server/telegram/i18n";
import { formatRupiah } from "@/server/utils/format";
import {
  availabilityEmoji,
  availabilityButtonStyle,
  productAvailabilityById,
} from "./availability";
import {
  catalogProductNumber,
  groupSelectionPayload,
  parseCatalogSelection,
  parseGroupSelection,
} from "./selection";
import type { CatalogNavigationRenderer } from "./types";

export function productGroupTelegramDocument(input: {
  displayName: string;
  groupName: string;
  description: string;
  descriptionEntities: unknown;
  variantCount: number;
  currentPage: number;
  totalPages: number;
  customEmojiSettings: TelegramCustomEmojiSettings;
  locale?: TelegramLocale;
  maxTextLength?: number;
}): TelegramMessageDocument {
  const copy = catalogCopy(input.locale ?? "id");
  const header = formatTelegramMessage({
    text: `${copy.chooseVariantTitle}\n\n${input.displayName}\n\n`,
    customEmojiSettings: input.customEmojiSettings,
    emojiKeys: ["product"],
    bold: [copy.chooseVariantTitle, input.groupName],
  });
  const pageLabel = `${input.currentPage}/${input.totalPages}`;
  const footer = formatTelegramMessage({
    text: [
      "",
      "",
      copy.variantPage(input.variantCount, pageLabel),
      `✅ ${copy.availabilityLegend}`,
      "",
      copy.variantHint,
    ].join("\n"),
    customEmojiSettings: input.customEmojiSettings,
    emojiKeys: [],
    code: [pageLabel],
  });
  const maxDescriptionLength = Math.max(
    0,
    Math.min(
      500,
      (input.maxTextLength ?? Number.POSITIVE_INFINITY) -
        header.text.length -
        footer.text.length,
    ),
  );
  const description = catalogDescriptionDocument({
    description: input.description,
    entities: input.descriptionEntities,
    maxLength: maxDescriptionLength,
  });
  return composeTelegramMessageDocuments([header, description, footer]);
}

function contains(value: string | null | undefined, search: string) {
  return value?.toLocaleLowerCase("id-ID").includes(search.toLocaleLowerCase("id-ID")) ?? false;
}

export async function showProductGroup(
  render: CatalogNavigationRenderer,
  chatId: string,
  groupId: string,
  messageId?: number,
  page = 1,
) {
  const [group, session, maintenance, customEmojiSettings] = await Promise.all([
    prisma.productGroup.findFirst({
      where: { id: groupId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        description: true,
        descriptionEntities: true,
        descriptionEn: true,
        descriptionEntitiesEn: true,
        imageUrl: true,
      },
    }),
    prisma.botSession.findUnique({
      where: { chatId },
      select: { cart: true, catalogSearchQuery: true, locale: true },
    }),
    getMaintenanceState(),
    getTelegramCustomEmojiSettings(),
  ]);
  if (!group) throw new Error("Kategori produk tidak tersedia");
  const locale = normalizeTelegramLocale(session?.locale);
  const copy = catalogCopy(locale);
  const localizedDescription = localizedCatalogDescription({
    locale,
    description: group.description,
    descriptionEntities: group.descriptionEntities,
    descriptionEn: group.descriptionEn,
    descriptionEntitiesEn: group.descriptionEntitiesEn,
  });

  const previousCatalog = parseCatalogSelection(session?.cart);
  const previousGroup = parseGroupSelection(session?.cart);
  const catalogPage = previousCatalog?.page ?? previousGroup?.catalogPage ?? 1;
  const search = session?.catalogSearchQuery?.trim().slice(0, 50) || "";
  const groupMatchesSearch = Boolean(search) && (
    contains(group.name, search) ||
    contains(group.description, search) ||
    contains(group.descriptionEn, search)
  );
  const products = await prisma.product.findMany({
    where: {
      groupId: group.id,
      status: "ACTIVE",
      ...(search && !groupMatchesSearch
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { variantLabel: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { descriptionEn: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      variantLabel: true,
      price: true,
      createdAt: true,
      groupSortOrder: true,
      preorderEnabled: true,
      preorderLimit: true,
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
  });
  const availabilityByProduct = await productAvailabilityById(products);
  const rankedProducts = products
    .map((product) => ({
      ...product,
      availability: availabilityByProduct.get(product.id)!,
    }))
    .filter((product) => Boolean(product.availability))
    .sort(
      (left, right) =>
        compareCheckoutAvailability(
          left.availability.availability,
          right.availability.availability,
        ) ||
        left.groupSortOrder - right.groupSortOrder ||
        right.createdAt.getTime() - left.createdAt.getTime(),
    );
  const totalPages = Math.max(1, Math.ceil(rankedProducts.length / PRODUCT_VARIANT_PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const pageProducts = rankedProducts.slice(
    (currentPage - 1) * PRODUCT_VARIANT_PAGE_SIZE,
    currentPage * PRODUCT_VARIANT_PAGE_SIZE,
  );
  const numberedProducts = pageProducts.map((product, index) => ({
    ...product,
    number: catalogProductNumber(currentPage, PRODUCT_VARIANT_PAGE_SIZE, index),
  }));
  const catalogCallback = search
    ? `catalog_search_page:${catalogPage}`
    : `catalog:${catalogPage}`;

  if (numberedProducts.length === 0) {
    const emptyText = search
        ? `🔎 ${copy.noMatchingVariant(group.name, search)}`
        : `🧩 ${copy.noActiveVariant(group.name)}`;
    const presentation = formatTelegramMessage({
      text: emptyText,
      customEmojiSettings,
      emojiKeys: search ? ["search"] : ["product"],
      bold: [group.name],
    });
    await render({
      chatId,
      messageId,
      ...presentation,
      replyMarkup: {
        inline_keyboard: [[{
          text: `⬅️ ${copy.backToCatalog}`,
          callback_data: catalogCallback,
          ...(customEmojiIdForKey(customEmojiSettings, "back")
            ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "back") }
            : {}),
        }]],
      },
    });
    return;
  }

  const pagination = [
    ...(currentPage > 1
      ? [{ text: "⬅️", callback_data: `group_page:${group.id}:${currentPage - 1}` }]
      : []),
    { text: `${currentPage}/${totalPages}`, callback_data: `group_page:${group.id}:${currentPage}` },
    ...(currentPage < totalPages
      ? [{ text: "➡️", callback_data: `group_page:${group.id}:${currentPage + 1}` }]
      : []),
  ];
  const keyboard: InlineKeyboard = {
    inline_keyboard: [
      ...numberedProducts.map((product) => {
        const productEmojiId = firstCustomEmojiId(
          `${group.name} ${product.variantLabel?.trim() || product.name}`,
          customEmojiSettings,
          "product",
        );
        return [{
          text: `${product.number}. ${availabilityEmoji(product.availability.availability, maintenance.enabled)} ${product.variantLabel?.trim() || product.name} · ${formatRupiah(product.price)}`,
          callback_data: `product:${product.id}`,
          style: availabilityButtonStyle(product.availability.availability, maintenance.enabled),
          ...(productEmojiId ? { icon_custom_emoji_id: productEmojiId } : {}),
        }];
      }),
      pagination,
      [
        {
          text: `⬅️ ${copy.catalog}`,
          callback_data: catalogCallback,
          ...(customEmojiIdForKey(customEmojiSettings, "back")
            ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "back") }
            : {}),
        },
        {
          text: `🔎 ${copy.search}`,
          callback_data: "catalog_search",
          ...(customEmojiIdForKey(customEmojiSettings, "search")
            ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "search") }
            : {}),
        },
      ],
    ],
  };
  const groupCustomEmojiId = firstBrandCustomEmojiId(
    group.name,
    customEmojiSettings,
  );
  const photoUrl = telegramCatalogImageUrl({
    kind: "group",
    id: group.id,
    imageUrl: group.imageUrl,
  });
  const presentation = maintenance.enabled
    ? formatTelegramMessage({
        text: `🔧 MAINTENANCE\n\n${maintenance.message}\n\n${copy.maintenanceVariants}`,
        customEmojiSettings,
        emojiKeys: ["warning"],
        bold: ["MAINTENANCE"],
      })
    : productGroupTelegramDocument({
        displayName: groupCustomEmojiId
          ? group.name
          : productDisplayName(group.name),
        groupName: group.name,
        description: localizedDescription.description,
        descriptionEntities: localizedDescription.descriptionEntities,
        variantCount: rankedProducts.length,
        currentPage,
        totalPages,
        customEmojiSettings,
        locale,
        maxTextLength: photoUrl ? 1_024 : undefined,
      });
  const rendered = await render({
    chatId,
    messageId,
    ...presentation,
    replyMarkup: keyboard,
    photoUrl,
  });
  await prisma.botSession.upsert({
    where: { chatId },
    create: {
      chatId,
      state: "BROWSING",
      cart: groupSelectionPayload({
        messageId: rendered.message_id,
        groupId: group.id,
        page: currentPage,
        catalogPage,
        searchQuery: search || null,
        items: numberedProducts.map((product) => ({
          number: product.number,
          productId: product.id,
        })),
      }),
      catalogSearchQuery: search || null,
    },
    update: {
      state: "BROWSING",
      cart: groupSelectionPayload({
        messageId: rendered.message_id,
        groupId: group.id,
        page: currentPage,
        catalogPage,
        searchQuery: search || null,
        items: numberedProducts.map((product) => ({
          number: product.number,
          productId: product.id,
        })),
      }),
      catalogSearchQuery: search || null,
    },
  });
}
