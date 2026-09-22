import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { normalizeOrderQuantity } from "@/server/checkout/order-quantity";
import { normalizeBuyerIdentity } from "@/server/orders/buyer";
import { normalizeTelegramLocale } from "@/server/telegram/i18n";
import type {
  PendingMessage,
  PendingProductSearch,
  PendingQuantitySelection,
  PendingReferralCode,
  PendingSmsSearch,
  TelegramUser,
} from "./types";

function isJsonObject(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parsePendingQuantitySelection(
  value: Prisma.JsonValue | null,
): PendingQuantitySelection | null {
  if (!isJsonObject(value)) return null;
  const productId = value.productId;
  const messageId = value.messageId;
  if (
    typeof productId !== "string" ||
    productId.length === 0 ||
    typeof messageId !== "number" ||
    !Number.isSafeInteger(messageId) ||
    messageId <= 0
  ) {
    return null;
  }
  const returnCallback = value.returnCallback;
  if (
    returnCallback !== undefined &&
    (typeof returnCallback !== "string" ||
      Buffer.byteLength(returnCallback, "utf8") > 64 ||
      !/^(?:catalog(?:_search_page)?:\d+|group:[^:]+|group_page:[^:]+:\d+)$/.test(returnCallback))
  ) {
    return null;
  }
  return {
    productId,
    messageId,
    ...(returnCallback ? { returnCallback } : {}),
  };
}

export function parsePendingSmsSearch(
  value: Prisma.JsonValue | null,
): PendingSmsSearch | null {
  if (!isJsonObject(value) || typeof value.messageId !== "number") return null;
  return {
    messageId: value.messageId,
    countryServiceId: typeof value.countryServiceId === "number"
      ? value.countryServiceId
      : undefined,
    countryCategory: value.countryCategory === "success" ? "success" : "cheap",
  };
}

export function parsePendingMessage(value: Prisma.JsonValue | null): PendingMessage | null {
  if (!isJsonObject(value) || typeof value.messageId !== "number") return null;
  return { messageId: value.messageId };
}

export function parseQuantityCallback(data: string, prefix: string) {
  if (!data.startsWith(prefix)) throw new Error("Pilihan jumlah tidak valid");
  const [productId, rawQuantity, ...extra] = data.slice(prefix.length).split(":");
  if (!productId || !rawQuantity || extra.length > 0 || !/^\d+$/.test(rawQuantity)) {
    throw new Error("Pilihan jumlah tidak valid");
  }
  return {
    productId,
    quantity: normalizeOrderQuantity(Number.parseInt(rawQuantity, 10)),
  };
}

/** Reset the polymorphic conversation payload before entering a new flow. */
export async function clearPendingQuantity(chatId: string) {
  await prisma.botSession.updateMany({
    where: { chatId },
    data: { state: "BROWSING", cart: Prisma.JsonNull },
  });
}

/** Leave quantity-entry mode while retaining catalog return navigation. */
export async function completePendingQuantitySelection(chatId: string) {
  await prisma.botSession.updateMany({
    where: { chatId, state: "AWAITING_QUANTITY" },
    data: { state: "BROWSING" },
  });
}

export async function rememberTelegramUser(chatId: string, user?: TelegramUser) {
  const inboundAt = new Date();
  const identity = normalizeBuyerIdentity({
    username: user?.username,
    firstName: user?.first_name,
    lastName: user?.last_name,
  });
  await prisma.botSession.upsert({
    where: { chatId },
    create: {
      chatId,
      ...identity,
      locale: normalizeTelegramLocale(user?.language_code),
      lastInboundAt: inboundAt,
      reengagementSequence: 0,
      telegramReachable: true,
    },
    update: {
      ...identity,
      lastInboundAt: inboundAt,
      reengagementSequence: 0,
      telegramReachable: true,
    },
  });
  return identity;
}

// Keep these aliases close to the parser implementation for domain handlers.
export type { PendingProductSearch, PendingReferralCode };
