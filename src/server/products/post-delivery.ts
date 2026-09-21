import type { Prisma } from "@/generated/prisma/client";
import {
  normalizeTelegramRichTextDocument,
  sliceTelegramRichTextDocument,
  shiftTelegramRichTextEntities,
  type TelegramRichTextEntity,
} from "@/lib/telegram-rich-text";
import type { TelegramLocale } from "@/server/telegram/i18n";
import { formatRupiah } from "@/server/utils/format";

export const PRODUCT_POST_DELIVERY_KIND = "PRODUCT_POST_DELIVERY";
// Keep private buyer guidance ahead of public catalog broadcasts while leaving
// the optional attachment (priority 4) in front of it.
export const PRODUCT_POST_DELIVERY_PRIORITY = 5;
export const MAX_POST_DELIVERY_INSTRUCTIONS_LENGTH = 3200;
export const MAX_PRODUCT_REDEEM_URL_LENGTH = 2048;

type ProductPostDeliverySnapshot = {
  version: 1;
  productName: string;
  invoiceNumber: string;
  messageText: string;
  messageEntities: TelegramRichTextEntity[];
  redeemUrl: string | null;
};

export class ProductPostDeliveryInputError extends Error {}

export function normalizePostDeliveryInstructions(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (normalized.length > MAX_POST_DELIVERY_INSTRUCTIONS_LENGTH) {
    throw new ProductPostDeliveryInputError(
      `Instruksi setelah pengiriman maksimal ${MAX_POST_DELIVERY_INSTRUCTIONS_LENGTH} karakter`,
    );
  }
  return normalized;
}

export function normalizeProductPostDeliveryContent(input: {
  instructions: unknown;
  entities: unknown;
}) {
  const rawInstructions = String(input.instructions ?? "");
  if (!rawInstructions.trim()) return { instructions: null, entities: [] };
  if (rawInstructions.length > MAX_POST_DELIVERY_INSTRUCTIONS_LENGTH) {
    throw new ProductPostDeliveryInputError(
      `Instruksi setelah pengiriman maksimal ${MAX_POST_DELIVERY_INSTRUCTIONS_LENGTH} karakter`,
    );
  }
  try {
    const normalized = normalizeTelegramRichTextDocument({
      text: rawInstructions,
      entities: input.entities,
      maxLength: MAX_POST_DELIVERY_INSTRUCTIONS_LENGTH,
    });
    return { instructions: normalized.text, entities: normalized.entities };
  } catch (error) {
    throw new ProductPostDeliveryInputError(
      error instanceof Error ? error.message : "Format instruksi Telegram tidak valid",
    );
  }
}

export function normalizeProductRedeemUrl(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (normalized.length > MAX_PRODUCT_REDEEM_URL_LENGTH) {
    throw new ProductPostDeliveryInputError("URL redeem terlalu panjang");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new ProductPostDeliveryInputError("URL redeem tidak valid");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    throw new ProductPostDeliveryInputError(
      "URL redeem wajib memakai HTTPS tanpa username atau password",
    );
  }
  return parsed.toString();
}

export function productPostDeliveryDedupeKey(orderId: string, productId: string) {
  return `product-post-delivery:${orderId}:${productId}`;
}

export function productPostDeliveryMessage(input: {
  productName: string;
  invoiceNumber: string;
  instructions: string | null;
  redeemUrl: string | null;
}) {
  const body = input.instructions ?? (
    input.redeemUrl
      ? "Gunakan tombol di bawah untuk membuka halaman redeem produk."
      : ""
  );
  return [
    "Panduan setelah produk terkirim",
    "",
    `Produk: ${input.productName}`,
    `Invoice: ${input.invoiceNumber}`,
    "",
    body,
  ].join("\n");
}

export function productPostDeliveryDocument(input: {
  productName: string;
  invoiceNumber: string;
  instructions: string | null;
  instructionEntities: unknown;
  redeemUrl: string | null;
}) {
  const rawBody = input.instructions ?? (
    input.redeemUrl
      ? "Gunakan tombol di bawah untuk membuka halaman redeem produk."
      : ""
  );
  const normalizedBody = rawBody
    ? normalizeTelegramRichTextDocument({
        text: rawBody,
        entities: input.instructions ? input.instructionEntities : [],
        maxLength: MAX_POST_DELIVERY_INSTRUCTIONS_LENGTH,
      })
    : { text: "", entities: [] };
  const body = normalizedBody.text;
  const messageText = productPostDeliveryMessage({
    productName: input.productName,
    invoiceNumber: input.invoiceNumber,
    instructions: normalizedBody.text,
    redeemUrl: input.redeemUrl,
  });
  const bodyOffset = messageText.length - body.length;
  const title = "Panduan setelah produk terkirim";
  const productPrefix = "Produk: ";
  const invoicePrefix = "Invoice: ";
  const productNameOffset = messageText.indexOf(productPrefix) + productPrefix.length;
  const invoiceOffset = messageText.indexOf(invoicePrefix) + invoicePrefix.length;
  const messageEntities: TelegramRichTextEntity[] = [
    { type: "bold", offset: messageText.indexOf(title), length: title.length },
    ...(productNameOffset >= 0
      ? [{ type: "bold" as const, offset: productNameOffset, length: input.productName.length }]
      : []),
    ...(invoiceOffset >= 0
      ? [{ type: "code" as const, offset: invoiceOffset, length: input.invoiceNumber.length }]
      : []),
    ...shiftTelegramRichTextEntities(normalizedBody.entities, bodyOffset),
  ];
  return { text: messageText, entities: messageEntities };
}

function normalizedStoredInstructions(value: unknown) {
  const text = String(value ?? "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .trim();
  if (!text) return null;
  return sliceTelegramRichTextDocument(
    { text, entities: [] },
    MAX_POST_DELIVERY_INSTRUCTIONS_LENGTH,
  ).text;
}

export function normalizeStoredProductPostDeliveryContent(input: {
  instructions: unknown;
  entities: unknown;
}) {
  const plainInstructions = normalizedStoredInstructions(input.instructions);
  if (!plainInstructions) return { instructions: null, entities: [] };
  try {
    return normalizeProductPostDeliveryContent({
      instructions: input.instructions,
      entities: input.entities,
    });
  } catch {
    // Persisted legacy metadata must not roll back an already accepted
    // credential upload. Keep the readable guide and drop only its formatting.
    return { instructions: plainInstructions, entities: [] };
  }
}

export function safeStoredProductRedeemUrl(value: unknown) {
  try {
    return normalizeProductRedeemUrl(value);
  } catch {
    return null;
  }
}

export function serializeProductPostDeliverySnapshot(input: {
  productName: string;
  invoiceNumber: string;
  instructions: string | null;
  instructionEntities?: unknown;
  redeemUrl: string | null;
}) {
  const document = productPostDeliveryDocument({
    ...input,
    instructionEntities: input.instructionEntities ?? [],
  });
  const snapshot: ProductPostDeliverySnapshot = {
    version: 1,
    productName: input.productName,
    invoiceNumber: input.invoiceNumber,
    messageText: document.text,
    messageEntities: document.entities,
    redeemUrl: input.redeemUrl,
  };
  return JSON.stringify(snapshot);
}

export function parseProductPostDeliverySnapshot(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ProductPostDeliverySnapshot>;
    const rawEntities = parsed.messageEntities ?? [];
    if (
      parsed.version !== 1 ||
      typeof parsed.productName !== "string" ||
      typeof parsed.invoiceNumber !== "string" ||
      typeof parsed.messageText !== "string" ||
      !Array.isArray(rawEntities) ||
      !(
        parsed.redeemUrl === null ||
        typeof parsed.redeemUrl === "string"
      )
    ) {
      return null;
    }
    const plainMessage = String(parsed.messageText)
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n")
      .trim();
    if (!plainMessage || plainMessage.length > 4096) return null;
    let document;
    try {
      document = normalizeTelegramRichTextDocument({
        text: parsed.messageText,
        entities: rawEntities,
        maxLength: 4096,
      });
    } catch {
      // The message snapshot is immutable. If only its legacy entity metadata
      // is invalid, deliver that same readable text without formatting.
      document = { text: plainMessage, entities: [] };
    }
    const redeemUrl = safeStoredProductRedeemUrl(parsed.redeemUrl);
    return {
      ...parsed,
      messageText: document.text,
      messageEntities: document.entities,
      redeemUrl,
    } as ProductPostDeliverySnapshot;
  } catch {
    return null;
  }
}

export function serializeStoredProductPostDeliverySnapshot(input: {
  productName: string;
  invoiceNumber: string;
  instructions: unknown;
  instructionEntities: unknown;
  redeemUrl: unknown;
}) {
  const content = normalizeStoredProductPostDeliveryContent({
    instructions: input.instructions,
    entities: input.instructionEntities,
  });
  const redeemUrl = safeStoredProductRedeemUrl(input.redeemUrl);
  return serializeProductPostDeliverySnapshot({
    productName: input.productName,
    invoiceNumber: input.invoiceNumber,
    instructions: content.instructions,
    instructionEntities: content.entities,
    redeemUrl,
  });
}

export function productPostDeliveryGuideDocument(
  snapshot: ProductPostDeliverySnapshot,
) {
  const prefix = [
    "Panduan setelah produk terkirim",
    "",
    `Produk: ${snapshot.productName}`,
    `Invoice: ${snapshot.invoiceNumber}`,
  ].join("\n");
  const bodyPrefix = `${prefix}\n\n`;
  if (snapshot.messageText === prefix) {
    return { text: "", entities: [] as TelegramRichTextEntity[] };
  }
  if (!snapshot.messageText.startsWith(bodyPrefix)) {
    return {
      text: snapshot.messageText,
      entities: snapshot.messageEntities.map((entity) => ({ ...entity })),
    };
  }

  const text = snapshot.messageText.slice(bodyPrefix.length);
  const entities = snapshot.messageEntities.flatMap((entity) => {
    const start = Math.max(entity.offset, bodyPrefix.length);
    const end = Math.min(
      entity.offset + entity.length,
      snapshot.messageText.length,
    );
    if (end <= start) return [];
    return [{
      ...entity,
      offset: start - bodyPrefix.length,
      length: end - start,
    }];
  });
  return { text, entities };
}

export function completedProductDeliveryDocument(input: {
  snapshot: ProductPostDeliverySnapshot;
  quantity: number;
  grandTotal: number;
  locale?: TelegramLocale;
  includeGuide?: boolean;
}) {
  const english = input.locale === "en";
  const title = english ? "Purchase complete" : "Pembelian selesai";
  const status = english
    ? "Your product file is attached to this message."
    : "File produk terlampir pada pesan ini.";
  const header = [
    title,
    "",
    `Invoice: ${input.snapshot.invoiceNumber}`,
    `${english ? "Product" : "Produk"}: ${input.snapshot.productName}`,
    `${english ? "Quantity" : "Jumlah"}: ${input.quantity} item`,
    `Total: ${formatRupiah(input.grandTotal)}`,
    `Status: ${status}`,
  ].join("\n");
  const guide = input.includeGuide === false
    ? { text: "", entities: [] }
    : productPostDeliveryGuideDocument(input.snapshot);
  const guideTitle = english ? "Instructions" : "Panduan";
  const guidePrefix = guide.text ? `\n\n${guideTitle}\n` : "";
  const text = `${header}${guidePrefix}${guide.text}`;
  const invoiceOffset = text.indexOf(input.snapshot.invoiceNumber);
  const entities: TelegramRichTextEntity[] = [
    { type: "bold", offset: 0, length: title.length },
    ...(invoiceOffset >= 0
      ? [{
          type: "code" as const,
          offset: invoiceOffset,
          length: input.snapshot.invoiceNumber.length,
        }]
      : []),
    ...(guide.text
      ? [{
          type: "bold" as const,
          offset: header.length + 2,
          length: guideTitle.length,
        }]
      : []),
    ...shiftTelegramRichTextEntities(
      guide.entities,
      header.length + guidePrefix.length,
    ),
  ];
  return { text, entities };
}

export function completedProductDeliveryReplyMarkup(input: {
  snapshot: ProductPostDeliverySnapshot;
  orderId: string;
  locale?: TelegramLocale;
}) {
  const english = input.locale === "en";
  return {
    inline_keyboard: [
      ...(input.snapshot.redeemUrl
        ? [[{
            text: english ? "Open redeem page" : "Buka halaman redeem",
            url: input.snapshot.redeemUrl,
            style: "primary" as const,
          }]]
        : []),
      [
        {
          text: english ? "Order details" : "Detail order",
          callback_data: `order:${input.orderId}`,
          style: "primary" as const,
        },
        {
          text: english ? "File not visible" : "File tidak terlihat",
          callback_data: `delivery_missing:${input.orderId}`,
          style: "danger" as const,
        },
      ],
      [{
        text: english ? "Back to catalog" : "Kembali ke katalog",
        callback_data: "catalog",
      }],
    ],
  };
}

export function productPostDeliveryReplyMarkup(
  snapshot: ProductPostDeliverySnapshot,
) {
  if (!snapshot.redeemUrl) return undefined;
  return {
    inline_keyboard: [[
      { text: "Buka halaman redeem", url: snapshot.redeemUrl },
    ]],
  };
}

export async function queueProductPostDeliveryNotifications(input: {
  tx: Prisma.TransactionClient;
  orderId: string;
  chatId: string;
  invoiceNumber: string;
  products: Array<{ id: string; name: string }>;
}) {
  const products = [...new Map(input.products.map((product) => [product.id, product])).values()];
  if (products.length === 0) return 0;

  const configured = await input.tx.product.findMany({
    where: { id: { in: products.map((product) => product.id) } },
    select: {
      id: true,
      postDeliveryInstructions: true,
      postDeliveryEntities: true,
      redeemUrl: true,
    },
  });
  const configurationById = new Map(configured.map((product) => [product.id, product]));
  let queued = 0;

  for (const product of products) {
    const configuration = configurationById.get(product.id);
    const messageText = serializeStoredProductPostDeliverySnapshot({
      productName: product.name,
      invoiceNumber: input.invoiceNumber,
      instructions: configuration?.postDeliveryInstructions,
      instructionEntities: configuration?.postDeliveryEntities,
      redeemUrl: configuration?.redeemUrl,
    });
    const dedupeKey = productPostDeliveryDedupeKey(input.orderId, product.id);
    await input.tx.telegramNotification.upsert({
      where: { dedupeKey },
      create: {
        dedupeKey,
        chatId: input.chatId,
        orderId: input.orderId,
        productId: product.id,
        kind: PRODUCT_POST_DELIVERY_KIND,
        priority: PRODUCT_POST_DELIVERY_PRIORITY,
        messageText,
      },
      update: {},
    });
    queued += 1;
  }
  return queued;
}

export function successChannelPrerequisiteState(
  statuses: string[],
): "READY" | "WAITING" | "BLOCKED" {
  if (statuses.some((status) => status === "FAILED" || status === "MANUAL_REVIEW")) {
    return "BLOCKED";
  }
  return statuses.every((status) => status === "SENT") ? "READY" : "WAITING";
}

/**
 * A customer guide is still useful when an optional attachment failed
 * definitively.  Only an in-flight or ambiguous attachment outcome must hold
 * the guide back; the public success announcement remains fail-closed through
 * `successChannelPrerequisiteState` above.
 */
export function productGuideAttachmentPrerequisiteState(
  statuses: string[],
): "READY" | "WAITING" | "BLOCKED" {
  if (statuses.some((status) => status === "MANUAL_REVIEW")) {
    return "BLOCKED";
  }
  return statuses.every((status) => status === "SENT" || status === "FAILED")
    ? "READY"
    : "WAITING";
}
