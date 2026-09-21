import {
  assertOrderQuantityWithinCapacity,
  getMaxOrderQuantity,
  OrderQuantityError,
  resolveOrderQuantityCapacity,
  type OrderQuantityCapacity,
} from "@/server/checkout/order-quantity";
import { maxOrderQuantityForUnitPrice } from "@/server/checkout/order-amount";
import { prisma } from "@/server/db/prisma";
import { getMaintenanceState } from "@/server/store/maintenance";
import { activePublicProductWhere } from "@/server/products/visibility";
import { telegramProductImageUrl } from "@/server/products/media";
import {
  customEmojiIdForKey,
  getTelegramCustomEmojiSettings,
} from "@/server/telegram/custom-emoji";
import { sendMessage } from "@/server/telegram/api";
import { formatTelegramMessage } from "@/server/telegram/message-formatter";
import { catalogCopy } from "@/server/telegram/catalog-copy";
import { normalizeTelegramLocale, type TelegramLocale } from "@/server/telegram/i18n";
import { telegramLocaleForChat } from "@/server/telegram/locale-store";
import {
  clearPendingQuantity,
  completePendingQuantitySelection,
  parsePendingQuantitySelection,
} from "@/server/telegram/session-state";
import { formatRupiah } from "@/server/utils/format";
import type {
  CatalogFlowDependencies,
  CatalogNavigationRenderer,
  QuantityInput,
} from "./types";
import { catalogReturnCallback } from "./selection";
import { sellableHealthFilter } from "./stock";

type QuantityProduct = {
  id?: string;
  name: string;
  variantLabel: string | null;
  group: { id: string; name: string; imageUrl: string | null } | null;
  imageUrl?: string | null;
};

function quantityProductPhotoUrl(productId: string, product: QuantityProduct) {
  return telegramProductImageUrl({
    productId,
    productImageUrl: product.imageUrl,
    group: product.group,
  });
}

function quantityProductName(product: QuantityProduct) {
  return product.group
    ? `${product.group.name} › ${product.variantLabel?.trim() || product.name}`
    : product.name;
}

async function findQuantityProduct(productId: string) {
  return prisma.product.findFirst({
    where: activePublicProductWhere(productId),
    select: {
      name: true,
      variantLabel: true,
      price: true,
      imageUrl: true,
      preorderEnabled: true,
      preorderLimit: true,
      group: { select: { id: true, name: true, imageUrl: true } },
      stockItems: {
        where: {
          archivedAt: null,
          status: "RESERVED",
          ...sellableHealthFilter(),
        },
        select: { id: true },
      },
      _count: {
        select: {
          stockItems: {
            where: {
              archivedAt: null,
              status: "AVAILABLE",
              ...sellableHealthFilter(),
            },
          },
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
}

function productQuantityCapacity(
  product: NonNullable<Awaited<ReturnType<typeof findQuantityProduct>>>,
) {
  return resolveOrderQuantityCapacity({
    readyStock: product._count.stockItems,
    reservedStock: product.stockItems.length,
    preorderEnabled: product.preorderEnabled,
    preorderLimit: product.preorderLimit,
    activePreorders: product._count.orderItems,
    configuredMaximum: Math.min(
      getMaxOrderQuantity(),
      maxOrderQuantityForUnitPrice(product.price),
    ),
  });
}

function quantityCapacityLines(
  capacity: ReturnType<typeof productQuantityCapacity>,
  locale: TelegramLocale,
): string[] {
  const copy = catalogCopy(locale);
  if (capacity.maxQuantity === 0) {
    return [copy.noQuantityCapacity];
  }
  if (capacity.maxQuantity <= capacity.readyStock) {
    return [
      copy.readyAccounts(capacity.readyStock),
      copy.maxOrderNow(capacity.maxQuantity),
    ];
  }
  return [
    copy.readyAccounts(capacity.readyStock),
    copy.maxIncludingPreorder(capacity.maxQuantity),
  ];
}

function quantityPresetRows(productId: string, maxQuantity: number, locale: TelegramLocale) {
  const copy = catalogCopy(locale);
  const quantities = [1, 2, 5, 10].filter(
    (quantity) => quantity <= maxQuantity,
  );
  const rows = [];
  for (let index = 0; index < quantities.length; index += 2) {
    rows.push(
      quantities.slice(index, index + 2).map((quantity) => ({
        text: copy.accountUnits(quantity),
        callback_data: `qty:${productId}:${quantity}`,
      })),
    );
  }
  return rows;
}

function quantityInputErrorText(input: {
  rawText: string;
  quantity: number;
  capacity: OrderQuantityCapacity;
  error: OrderQuantityError;
  locale: TelegramLocale;
}) {
  const copy = catalogCopy(input.locale);
  if (input.error.code === "QUANTITY_NOT_INTEGER") {
    return /^\d+$/.test(input.rawText)
      ? copy.quantityTooLarge
      : copy.numbersOnly;
  }
  if (input.error.code === "QUANTITY_BELOW_MINIMUM") {
    return copy.minimumQuantity;
  }
  if (input.error.code === "QUANTITY_ABOVE_GLOBAL_LIMIT") {
    return copy.aboveGlobalLimit(input.quantity, getMaxOrderQuantity());
  }
  if (input.capacity.maxQuantity === 0) {
    return copy.noOrderCapacity;
  }
  if (input.capacity.maxQuantity <= input.capacity.readyStock) {
    return copy.readyQuantityLimit(input.capacity.readyStock, input.capacity.maxQuantity);
  }
  return copy.productQuantityLimit(input.quantity, input.capacity.maxQuantity);
}

export async function showQuantityOptions(
  render: CatalogNavigationRenderer,
  chatId: string,
  productId: string,
  messageId: number,
) {
  const [product, maintenance, customEmojiSettings, session] = await Promise.all([
    findQuantityProduct(productId),
    getMaintenanceState(),
    getTelegramCustomEmojiSettings(),
    prisma.botSession.findUnique({
      where: { chatId },
      select: { cart: true, catalogSearchQuery: true, locale: true },
    }),
  ]);
  if (!product) throw new Error("Produk tidak tersedia");
  const locale = normalizeTelegramLocale(session?.locale);
  const copy = catalogCopy(locale);
  const productName = quantityProductName(product);
  const photoUrl = quantityProductPhotoUrl(productId, product);
  const capacity = productQuantityCapacity(product);
  const previousPending = parsePendingQuantitySelection(session?.cart ?? null);
  const returnCallback = previousPending?.productId === productId && previousPending.returnCallback
    ? previousPending.returnCallback
    : catalogReturnCallback({
        value: session?.cart,
        catalogSearchQuery: session?.catalogSearchQuery,
        productGroupId: product.group?.id,
      });
  if (maintenance.enabled) {
    const presentation = formatTelegramMessage({
      text: `🔧 MAINTENANCE\n\n${productName}\n\n${maintenance.message}`,
      customEmojiSettings,
      emojiKeys: ["product"],
      bold: ["MAINTENANCE", productName],
    });
    const rendered = await render({
      chatId,
      messageId,
      ...presentation,
      photoUrl,
      replyMarkup: {
        inline_keyboard: [
          [{
            text: `⬅️ ${copy.back}`,
            callback_data: `product:${productId}`,
            ...(customEmojiIdForKey(customEmojiSettings, "back")
              ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "back") }
              : {}),
          }],
        ],
      },
    });
    await completePendingQuantitySelection(chatId);
    return rendered;
  }
  const quantityRange = `1-${capacity.maxQuantity}`;
  const quantityText = [
    productName,
    `${copy.unitPrice}: ${formatRupiah(product.price)}`,
    "",
    ...quantityCapacityLines(capacity, locale),
    "",
    ...(capacity.maxQuantity > 0
      ? [
          copy.chooseOrTypeQuantity(quantityRange),
          copy.uniqueStockPerUnit,
        ]
      : [copy.productCannotBeOrdered]),
  ].join("\n");
  const presentation = formatTelegramMessage({
    text: quantityText,
    customEmojiSettings,
    emojiKeys: ["product"],
    bold: [productName, copy.chooseQuantity],
    code: [
      formatRupiah(product.price),
      ...(capacity.maxQuantity > 0 ? [quantityRange] : []),
    ],
  });
  const presetRows = quantityPresetRows(productId, capacity.maxQuantity, locale);
  const rendered = await render({
    chatId,
    messageId,
    ...presentation,
    photoUrl,
    replyMarkup: {
      inline_keyboard: [
        ...presetRows,
        [{
          text: `⬅️ ${copy.back}`,
          callback_data: `product:${productId}`,
          ...(customEmojiIdForKey(customEmojiSettings, "back")
            ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "back") }
            : {}),
        }],
      ],
    },
  });
  await prisma.botSession.upsert({
    where: { chatId },
    create: {
      chatId,
      state: capacity.maxQuantity > 0 ? "AWAITING_QUANTITY" : "BROWSING",
      cart: {
        productId,
        messageId: rendered.message_id,
        returnCallback,
      },
    },
    update: {
      state: capacity.maxQuantity > 0 ? "AWAITING_QUANTITY" : "BROWSING",
      cart: {
        productId,
        messageId: rendered.message_id,
        returnCallback,
      },
    },
  });
  return rendered;
}

export async function showCustomQuantityPrompt(
  render: CatalogNavigationRenderer,
  chatId: string,
  productId: string,
  messageId: number,
) {
  const [product, customEmojiSettings, session] = await Promise.all([
    findQuantityProduct(productId),
    getTelegramCustomEmojiSettings(),
    prisma.botSession.findUnique({
      where: { chatId },
      select: { cart: true, catalogSearchQuery: true, locale: true },
    }),
  ]);
  if (!product) throw new Error("Produk tidak tersedia");
  const locale = normalizeTelegramLocale(session?.locale);
  const copy = catalogCopy(locale);
  const productName = quantityProductName(product);
  const photoUrl = quantityProductPhotoUrl(productId, product);
  const capacity = productQuantityCapacity(product);
  const previousPending = parsePendingQuantitySelection(session?.cart ?? null);
  const returnCallback = previousPending?.productId === productId && previousPending.returnCallback
    ? previousPending.returnCallback
    : catalogReturnCallback({
        value: session?.cart,
        catalogSearchQuery: session?.catalogSearchQuery,
        productGroupId: product.group?.id,
      });
  const quantityRange = `1-${capacity.maxQuantity}`;
  const exampleQuantity = Math.min(7, capacity.maxQuantity);
  const presentation = formatTelegramMessage({
    text: capacity.maxQuantity > 0
      ? [
          productName,
          "",
          ...quantityCapacityLines(capacity, locale),
          "",
          copy.sendQuantity(quantityRange),
          "",
          `${copy.example}: ${exampleQuantity}`,
        ].join("\n")
      : [
          productName,
          "",
          ...quantityCapacityLines(capacity, locale),
          "",
          copy.productCannotBeOrdered,
        ].join("\n"),
    customEmojiSettings,
    emojiKeys: ["product"],
    bold: [productName],
    code: capacity.maxQuantity > 0
      ? [quantityRange, String(exampleQuantity)]
      : [],
  });
  const rendered = await render({
    chatId,
    messageId,
    ...presentation,
    photoUrl,
    replyMarkup: {
      inline_keyboard: [
        [{
          text: `⬅️ ${copy.back}`,
          callback_data: `buy:${productId}`,
          ...(customEmojiIdForKey(customEmojiSettings, "back")
            ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "back") }
            : {}),
        }],
        [{
          text: `🏠 ${copy.mainMenu}`,
          callback_data: "menu",
          ...(customEmojiIdForKey(customEmojiSettings, "home")
            ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "home") }
            : {}),
        }],
      ],
    },
  });
  await prisma.botSession.upsert({
    where: { chatId },
    create: {
      chatId,
      state: capacity.maxQuantity > 0 ? "AWAITING_QUANTITY" : "BROWSING",
      cart: {
        productId,
        messageId: rendered.message_id,
        returnCallback,
      },
    },
    update: {
      state: capacity.maxQuantity > 0 ? "AWAITING_QUANTITY" : "BROWSING",
      cart: {
        productId,
        messageId: rendered.message_id,
        returnCallback,
      },
    },
  });
  return rendered;
}

export async function handleQuantityInput(
  deps: Pick<
    CatalogFlowDependencies,
    "showMenu" | "showPaymentOptions"
  >,
  input: QuantityInput,
) {
  const pending = parsePendingQuantitySelection(input.cart);
  if (!pending || !input.user) {
    await clearPendingQuantity(input.chatId);
    return deps.showMenu(input.chatId);
  }
  const [product, customEmojiSettings, locale] = await Promise.all([
    findQuantityProduct(pending.productId),
    getTelegramCustomEmojiSettings(),
    telegramLocaleForChat(input.chatId, input.user.language_code),
  ]);
  const copy = catalogCopy(locale);
  if (!product) {
    await clearPendingQuantity(input.chatId);
    await sendMessage(
      input.chatId,
      copy.unavailableProduct,
    );
    return;
  }
  const productName = quantityProductName(product);
  const capacity = productQuantityCapacity(product);
  const quantity = Number(input.text);
  let quantityError: OrderQuantityError | null = null;
  try {
    if (!/^\d+$/.test(input.text)) {
      throw new OrderQuantityError(
        "QUANTITY_NOT_INTEGER",
        copy.integerQuantity,
      );
    }
    assertOrderQuantityWithinCapacity(quantity, capacity);
  } catch (error) {
    if (!(error instanceof OrderQuantityError)) throw error;
    quantityError = error;
  }
  if (quantityError) {
    const invalidReason = quantityInputErrorText({
      rawText: input.text,
      quantity,
      capacity,
      error: quantityError,
      locale,
    });
    const invalidQuantityText = [
      productName,
      "",
      `❌ ${invalidReason}`,
      ...(capacity.maxQuantity > 0
        ? ["", copy.availableRange(`1-${capacity.maxQuantity}`)]
        : []),
    ].join("\n");
    const presentation = formatTelegramMessage({
      text: invalidQuantityText,
      customEmojiSettings,
      emojiKeys: ["product", "warning"],
      bold: [productName],
      code: capacity.maxQuantity > 0
        ? [`1-${capacity.maxQuantity}`]
        : [],
    });
    await sendMessage(input.chatId, presentation.text, {
      inline_keyboard: [
        [{
          text: `⬅️ ${copy.back}`,
          callback_data: `buy:${pending.productId}`,
          ...(customEmojiIdForKey(customEmojiSettings, "back")
            ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "back") }
            : {}),
        }],
        [{
          text: `🏠 ${copy.mainMenu}`,
          callback_data: "menu",
          ...(customEmojiIdForKey(customEmojiSettings, "home")
            ? { icon_custom_emoji_id: customEmojiIdForKey(customEmojiSettings, "home") }
            : {}),
        }],
      ],
    }, presentation.entities);
    return;
  }
  await completePendingQuantitySelection(input.chatId);
  return deps.showPaymentOptions(
    input.chatId,
    pending.productId,
    input.user,
    quantity,
    pending.messageId,
  );
}
