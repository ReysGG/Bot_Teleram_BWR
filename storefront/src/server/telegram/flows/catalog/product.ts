import { prisma } from "@/server/db/prisma";
import {
  preorderSlotsRemaining,
  resolveCheckoutAvailability,
} from "@/server/preorder/policy";
import { getMaintenanceState } from "@/server/store/maintenance";
import { activePublicProductWhere } from "@/server/products/visibility";
import {
  catalogDescriptionDocument,
  localizedCatalogDescription,
} from "@/server/products/catalog-description";
import { telegramProductImageUrl } from "@/server/products/media";
import type { InlineKeyboard } from "@/server/telegram/api";
import {
  getTelegramCustomEmojiSettings,
  type TelegramCustomEmojiSettings,
} from "@/server/telegram/custom-emoji";
import {
  composeTelegramMessageDocuments,
  formatTelegramMessage,
  PRODUCT_MESSAGE_CODE_PATTERNS,
  type TelegramMessageDocument,
} from "@/server/telegram/message-formatter";
import { productDisplayName } from "@/server/telegram/product-presentation";
import { catalogCopy } from "@/server/telegram/catalog-copy";
import { normalizeTelegramLocale, type TelegramLocale } from "@/server/telegram/i18n";
import { parsePendingQuantitySelection } from "@/server/telegram/session-state";
import { formatRupiah } from "@/server/utils/format";
import { sellableHealthFilter } from "./stock";
import { catalogReturnCallback } from "./selection";
import type { CatalogNavigationRenderer } from "./types";

export function productDetailTelegramDocument(input: {
  displayName: string;
  boldNames: readonly string[];
  description: string;
  descriptionEntities: unknown;
  price: string;
  availabilityLines: readonly string[];
  customEmojiSettings: TelegramCustomEmojiSettings;
  locale?: TelegramLocale;
  maxTextLength?: number;
}): TelegramMessageDocument {
  const copy = catalogCopy(input.locale ?? "id");
  const header = formatTelegramMessage({
    text: `${copy.productDetailTitle}\n\n${input.displayName}\n\n`,
    customEmojiSettings: input.customEmojiSettings,
    emojiKeys: ["product"],
    bold: [copy.productDetailTitle, ...input.boldNames],
  });
  const footer = formatTelegramMessage({
    text: [
      "",
      "",
      `💰 ${copy.priceLabel}: ${input.price}`,
      ...input.availabilityLines,
    ].join("\n"),
    customEmojiSettings: input.customEmojiSettings,
    emojiKeys: ["product"],
    bold: [/(?:Status:\s*)([^\n]+)/g],
    code: [input.price, ...PRODUCT_MESSAGE_CODE_PATTERNS],
  });
  const maxDescriptionLength = Math.max(
    0,
    Math.min(
      900,
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

export async function showProduct(
  render: CatalogNavigationRenderer,
  chatId: string,
  productId: string,
  messageId?: number,
) {
  const product = await prisma.product.findFirst({
    where: activePublicProductWhere(productId),
    select: {
      id: true,
      name: true,
      variantLabel: true,
      groupId: true,
      group: { select: { id: true, name: true, imageUrl: true } },
      description: true,
      descriptionEntities: true,
      descriptionEn: true,
      descriptionEntitiesEn: true,
      imageUrl: true,
      price: true,
      preorderEnabled: true,
      preorderEtaText: true,
      preorderLimit: true,
      stockItems: {
        where: {
          status: { in: ["AVAILABLE", "RESERVED"] },
          ...sellableHealthFilter(),
        },
        select: { status: true },
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
  });
  if (!product) throw new Error("Produk tidak tersedia");
  const [maintenance, session, customEmojiSettings] = await Promise.all([
    getMaintenanceState(),
    prisma.botSession.findUnique({
      where: { chatId },
      select: { catalogSearchQuery: true, cart: true, locale: true },
    }),
    getTelegramCustomEmojiSettings(),
  ]);
  const locale = normalizeTelegramLocale(session?.locale);
  const copy = catalogCopy(locale);
  const localizedDescription = localizedCatalogDescription({
    locale,
    description: product.description,
    descriptionEntities: product.descriptionEntities,
    descriptionEn: product.descriptionEn,
    descriptionEntitiesEn: product.descriptionEntitiesEn,
  });

  const availableUnits = product.stockItems.filter(
    (item) => item.status === "AVAILABLE",
  ).length;
  const reservedUnits = product.stockItems.filter(
    (item) => item.status === "RESERVED",
  ).length;
  const availability = resolveCheckoutAvailability({
    stockAvailable: availableUnits > 0,
    reservedUnits,
    preorderEnabled: product.preorderEnabled,
    preorderLimit: product.preorderLimit,
    activePreorders: product._count.orderItems,
  });
  const slots = preorderSlotsRemaining(
    product.preorderLimit,
    product._count.orderItems,
  );
  const availabilityLines = maintenance.enabled
    ? ["🔧 Status: MAINTENANCE", maintenance.message]
    : availability === "IN_STOCK"
      ? [`✅ ${copy.stockReady(availableUnits)}`, `⚡ ${copy.automaticDelivery}`]
      : availability === "WAITING_CHECKOUT"
        ? [
            `⏳ ${copy.checkoutLocked(reservedUnits)}`,
            copy.retryAfterInvoice,
            copy.preorderWaitsForReservation,
          ]
        : availability === "PREORDER"
          ? [
              `⏳ ${copy.preorderStatus}`,
              `🗓️ ${copy.estimate(product.preorderEtaText ?? copy.estimateFallback)}`,
              `🎟️ ${copy.remainingSlots(slots ?? copy.unlimited)}`,
              copy.preorderFifo,
            ]
          : availability === "PREORDER_FULL"
            ? [
                `🚫 ${copy.preorderFull}`,
                `🗓️ ${copy.estimate(product.preorderEtaText ?? "-")}`,
              ]
            : [`❌ ${copy.outOfStock}`];

  const pendingQuantity = parsePendingQuantitySelection(session?.cart ?? null);
  const backCallback = pendingQuantity?.productId === product.id && pendingQuantity.returnCallback
    ? pendingQuantity.returnCallback
    : catalogReturnCallback({
        value: session?.cart,
        catalogSearchQuery: session?.catalogSearchQuery,
        productGroupId: product.groupId,
      });
  const backLabel = product.group
    ? `⬅️ ${copy.backToVariants(product.group.name)}`
    : `⬅️ ${copy.catalog}`;
  const displayName = product.group
    ? `${productDisplayName(product.group.name)}\n${product.variantLabel?.trim() || product.name}`
    : productDisplayName(product.name);

  const keyboard: InlineKeyboard = {
    inline_keyboard: [
      ...(!maintenance.enabled &&
      (availability === "IN_STOCK" || availability === "PREORDER")
        ? [
            [
              {
                text: availability === "PREORDER"
                  ? `📥 ${copy.choosePreorderQuantity}`
                  : `🛒 ${copy.chooseQuantity}`,
                callback_data: `buy:${product.id}`,
              },
            ],
          ]
        : []),
      ...(!maintenance.enabled && availability === "WAITING_CHECKOUT"
        ? [[{
            text: `🔄 ${copy.checkStockAgain}`,
            callback_data: `product:${product.id}`,
          }]]
        : []),
      ...(!maintenance.enabled &&
      (availability === "OUT_OF_STOCK" || availability === "PREORDER_FULL")
        ? [
            [{
              text: `🔄 ${copy.checkStockAgain}`,
              callback_data: `product:${product.id}`,
            }],
            [{
              text: `🔔 ${copy.enableRestockNotification}`,
              callback_data: "subscribe",
            }],
          ]
        : []),
      [
        {
          text: backLabel,
          callback_data: backCallback,
        },
        {
          text: `🔎 ${copy.search}`,
          callback_data: "catalog_search",
        },
      ],
    ],
  };

  const photoUrl = telegramProductImageUrl({
    productId: product.id,
    productImageUrl: product.imageUrl,
    group: product.group,
  });
  const presentation = productDetailTelegramDocument({
    displayName,
    boldNames: product.group
      ? [product.group.name, product.variantLabel?.trim() || product.name]
      : [product.name],
    description: localizedDescription.description,
    descriptionEntities: localizedDescription.descriptionEntities,
    price: formatRupiah(product.price),
    availabilityLines,
    customEmojiSettings,
    locale,
    maxTextLength: photoUrl ? 1_024 : undefined,
  });
  await render({
    chatId,
    messageId,
    ...presentation,
    replyMarkup: keyboard,
    photoUrl,
  });
}
