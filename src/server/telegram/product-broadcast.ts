import { sellableStockWhere } from "@/server/stock/sellable";
import { prisma } from "@/server/db/prisma";
import { fanoutBroadcastNotifications } from "@/server/telegram/broadcast-fanout";
import {
  PRODUCT_RESTOCK_PRIORITY,
  PRODUCT_SOLD_OUT_PRIORITY,
  productRestockDedupeKey,
  productSoldOutDedupeKey,
} from "@/server/telegram/delivery-key";
import { formatRupiah } from "@/server/utils/format";
import { productDisplayName } from "@/server/telegram/product-presentation";
import { activePublicProductWhere } from "@/server/products/visibility";
import {
  firstCustomEmojiId,
  type TelegramCustomEmojiSettings,
} from "@/server/telegram/custom-emoji";
import {
  composeTelegramMessageDocuments,
  formatTelegramMessage,
  PRODUCT_MESSAGE_CODE_PATTERNS,
} from "@/server/telegram/message-formatter";
import { catalogDescriptionDocument } from "@/server/products/catalog-description";
import { catalogCopy } from "@/server/telegram/catalog-copy";
import type { TelegramLocale } from "@/server/telegram/i18n";

type ProductCreatedMessageInput = {
  name: string;
  price: number;
  description: string;
  availableNow: number;
  preorderEtaText?: string | null;
  groupName?: string | null;
  variantLabel?: string | null;
  locale?: TelegramLocale;
};

function groupedProductDisplayName(input: {
  name: string;
  groupName?: string | null;
  variantLabel?: string | null;
}) {
  return productDisplayName(
    input.groupName
      ? `${input.groupName} > ${input.variantLabel ?? input.name}`
      : input.name,
  );
}

export function productButtonTextWithCustomEmoji(
  text: string,
  iconCustomEmojiId?: string,
) {
  if (!iconCustomEmojiId) return text;
  const stripped = text
    .replace(
      /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+/u,
      "",
    )
    .trimStart();
  return stripped || text;
}

export function productCustomEmojiPresentation(input: {
  text: string;
  name: string;
  groupName?: string | null;
  variantLabel?: string | null;
  settings: TelegramCustomEmojiSettings;
}) {
  const productTitle = input.groupName
    ? `${input.groupName} ${input.variantLabel ?? input.name}`
    : input.name;
  const presentation = formatTelegramMessage({
    text: input.text,
    customEmojiSettings: input.settings,
    // Product/category branding is useful here; status and action icons are
    // kept as plain Unicode so announcements do not become visually dense.
    emojiKeys: ["catalog", "product"],
    bold: [
      /^(?:🔥\s*)?(PRODUK BARU|STOK BARU MASUK|NEW PRODUCT|NEW STOCK AVAILABLE)$/m,
      /^(?:🚨\s*)?(STOK SIAP HABIS|READY STOCK SOLD OUT)$/m,
      /━━━━━━━━━━━━\n\n([^\n]+)/,
      /(?:(?:Harga|Price):\s*)([^\n]+)/g,
    ],
    code: [
      ...PRODUCT_MESSAGE_CODE_PATTERNS,
      /(?:ditambahkan:|sekarang:|siap:)\s*(\d+\s+file)/gi,
    ],
  });
  const iconCustomEmojiId = firstCustomEmojiId(
    productTitle,
    input.settings,
    "product",
  );
  return { ...presentation, iconCustomEmojiId };
}

function productCreatedHeader(input: ProductCreatedMessageInput) {
  const copy = catalogCopy(input.locale ?? "id");
  return [
    `🔥 ${copy.newProductTitle}`,
    "━━━━━━━━━━━━",
    "",
    groupedProductDisplayName(input),
    `📦 ${copy.readyFiles(input.availableNow)}`,
    `💰 ${copy.priceLabel}: ${formatRupiah(input.price)}`,
    ...(input.preorderEtaText
      ? [`⏳ ${copy.preorderLabel(input.preorderEtaText)}`]
      : []),
  ].join("\n");
}

export function productCreatedMessage(input: ProductCreatedMessageInput) {
  const copy = catalogCopy(input.locale ?? "id");
  return [
    productCreatedHeader(input),
    input.description.replaceAll("**", "").slice(0, 700),
    copy.buyInstruction,
  ].join("\n\n");
}

export function productCreatedTelegramDocument(
  input: ProductCreatedMessageInput & {
    descriptionEntities: unknown;
    settings: TelegramCustomEmojiSettings;
    maxTextLength?: number;
  },
) {
  const copy = catalogCopy(input.locale ?? "id");
  const footerText = copy.buyInstruction;
  const header = productCustomEmojiPresentation({
    text: productCreatedHeader(input),
    name: input.name,
    groupName: input.groupName,
    variantLabel: input.variantLabel,
    settings: input.settings,
  });
  const footer = productCustomEmojiPresentation({
    text: footerText,
    name: input.name,
    groupName: input.groupName,
    variantLabel: input.variantLabel,
    settings: input.settings,
  });
  const separatorsLength = 4;
  const maxDescriptionLength = Math.max(
    0,
    Math.min(
      700,
      (input.maxTextLength ?? Number.POSITIVE_INFINITY) -
        header.text.length -
        footer.text.length -
        separatorsLength,
    ),
  );
  const description = catalogDescriptionDocument({
    description: input.description,
    entities: input.descriptionEntities,
    maxLength: maxDescriptionLength,
  });
  const document = composeTelegramMessageDocuments([
    header,
    { text: "\n\n", entities: [] },
    description,
    { text: "\n\n", entities: [] },
    footer,
  ]);
  return { ...document, iconCustomEmojiId: header.iconCustomEmojiId };
}

export function productRestockMessage(input: {
  name: string;
  price: number;
  addedCount: number;
  availableNow: number;
  groupName?: string | null;
  variantLabel?: string | null;
  locale?: TelegramLocale;
}) {
  const copy = catalogCopy(input.locale ?? "id");
  return [
    `🔥 ${copy.restockTitle}`,
    "━━━━━━━━━━━━",
    "",
    groupedProductDisplayName(input),
    `➕ ${copy.newlyAdded(input.addedCount)}`,
    `📦 ${copy.availableNow(input.availableNow)}`,
    `💰 ${copy.priceLabel}: ${formatRupiah(input.price)}`,
    "",
    copy.buyNowInstruction,
  ].join("\n");
}

export function productSoldOutMessage(input: {
  name: string;
  price: number;
  reservedNow: number;
  preorderEtaText?: string | null;
  groupName?: string | null;
  variantLabel?: string | null;
  locale?: TelegramLocale;
}) {
  const copy = catalogCopy(input.locale ?? "id");
  return [
    `🚨 ${copy.soldOutTitle}`,
    "━━━━━━━━━━━━",
    "",
    groupedProductDisplayName(input),
    `❌ ${copy.readyNowEmpty}`,
    ...(input.reservedNow > 0
      ? [`⏳ ${copy.reservedFiles(input.reservedNow)}`]
      : []),
    `💰 ${copy.priceLabel}: ${formatRupiah(input.price)}`,
    ...(input.preorderEtaText
      ? [`📅 ${copy.preorderLabel(input.preorderEtaText)}`]
      : [`🔔 ${copy.waitForRestock}`]),
    "",
    copy.openLatestStatus,
  ].join("\n");
}

export function broadcastSellableHealthFilter() {
  return sellableStockWhere();
}

export async function enqueueProductRestock(input: {
  productId: string;
  addedCount: number;
  batchId: string;
}) {
  if (input.addedCount <= 0) return 0;
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: activePublicProductWhere(input.productId),
      select: { id: true },
    });
    if (!product) return 0;
    const availableNow = await tx.digitalStockItem.count({
      where: {
        productId: input.productId,
        archivedAt: null,
        status: "AVAILABLE",
        ...broadcastSellableHealthFilter(),
      },
    });
    if (availableNow <= 0) return 0;

    const fanout = await fanoutBroadcastNotifications({
      tx,
      notificationFor: (chatId) => ({
        dedupeKey: productRestockDedupeKey(input.batchId, chatId),
        chatId,
        productId: input.productId,
        kind: "PRODUCT_RESTOCK",
        messageText: String(input.addedCount),
        priority: PRODUCT_RESTOCK_PRIORITY,
      }),
    });
    return fanout.queuedCount;
  });
}

export async function enqueueProductSoldOut(input: {
  productId: string;
  orderId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: activePublicProductWhere(input.productId),
      select: { id: true },
    });
    if (!product) return 0;
    // A sold-out check can run from both checkout creation and payment
    // confirmation. Do not fan out the same state to every subscriber for
    // every order in a short burst. Restock broadcasts remain the explicit
    // state-change signal that reopens this notification path.
    const cooldownSince = new Date(Date.now() - 15 * 60_000);
    const recentSoldOut = await tx.telegramNotification.findFirst({
      where: {
        productId: input.productId,
        kind: "PRODUCT_SOLD_OUT",
        createdAt: { gte: cooldownSince },
      },
      select: { id: true },
    });
    if (recentSoldOut) return 0;
    const availableNow = await tx.digitalStockItem.count({
      where: {
        productId: input.productId,
        archivedAt: null,
        status: "AVAILABLE",
        ...broadcastSellableHealthFilter(),
      },
    });
    if (availableNow > 0) return 0;

    const fanout = await fanoutBroadcastNotifications({
      tx,
      notificationFor: (chatId) => ({
        dedupeKey: productSoldOutDedupeKey(input.orderId, chatId),
        chatId,
        productId: input.productId,
        orderId: input.orderId,
        kind: "PRODUCT_SOLD_OUT",
        priority: PRODUCT_SOLD_OUT_PRIORITY,
      }),
    });
    return fanout.queuedCount;
  });
}
