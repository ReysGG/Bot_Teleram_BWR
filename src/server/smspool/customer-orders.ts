import { prisma } from "@/server/db/prisma";
import { normalizeBuyerIdentity } from "@/server/orders/buyer";
import {
  calculateSmsPoolSellPrice,
  cancelSmsPoolOrder,
  checkSmsPoolOrder,
  getSmsPoolActiveOrders,
  getSmsPoolHistory,
  getSmsPoolServices,
  getSmsPoolSuccessRates,
  purchaseSmsPoolNumber,
  resolveSmsPoolPurchaseCostUsd,
  smsPoolProviderPriceFloor,
  type SmsPoolOrder,
  SMSPOOL_NO_NUMBERS_MESSAGE,
  SMSPOOL_UNAVAILABLE_MESSAGE,
} from "@/server/smspool/client";
import {
  hasSmsPoolMessage,
  resolveSmsPoolCheckState,
  resolveSmsPoolOrderState,
  type SmsPoolResolvedState,
} from "@/server/smspool/order-state";
import { smsPoolPurchasePhoneNumber } from "@/server/smspool/phone";
import { applyWalletTransaction, ensureWallet } from "@/server/wallet/ledger";
import {
  smsPurchaseSuccessMessage,
  successChannelId,
} from "@/server/telegram/success-channel";
import { isPrivateTelegramChatId } from "@/server/telegram/chat-safety";
import { getMaintenanceState } from "@/server/store/maintenance";
import { webCustomerChatId } from "@/server/storefront/customer-access";
import {
  assertCheckoutPaymentMethodEnabled,
  getPaymentMethodAvailability,
} from "@/server/payment/method-availability";

type Buyer = {
  username?: string;
  first_name?: string;
  last_name?: string;
};

export const MAX_SMSPOOL_BULK_QUANTITY = 5;

export function normalizeSmsPoolBulkQuantity(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_SMSPOOL_BULK_QUANTITY
  ) {
    throw new Error(`Jumlah nomor SMS harus 1-${MAX_SMSPOOL_BULK_QUANTITY}`);
  }
  return value;
}

async function enqueueSmsSuccessNotification(order: {
  id: string;
  chatId: string;
  buyerUsername: string | null;
  buyerDisplayName: string | null;
  serviceName: string;
  countryName: string;
  sellPrice: number;
}) {
  if (isPrivateTelegramChatId(order.chatId)) {
    await prisma.telegramNotification.upsert({
      where: { dedupeKey: `sms-otp:user:${order.id}` },
      create: {
        dedupeKey: `sms-otp:user:${order.id}`,
        chatId: order.chatId,
        kind: "SMS_OTP_SUCCESS",
        priority: 15,
        messageText: order.id,
      },
      update: {},
    });
  }
  const channelId = successChannelId();
  if (!channelId) return;
  await prisma.telegramNotification.upsert({
    where: { dedupeKey: `success-channel:sms:${order.id}` },
    create: {
      dedupeKey: `success-channel:sms:${order.id}`,
      chatId: channelId,
      kind: "SUCCESS_CHANNEL",
      priority: 20,
      messageText: smsPurchaseSuccessMessage({
        buyer: order.buyerUsername || order.buyerDisplayName,
        serviceName: order.serviceName,
        countryName: order.countryName,
        total: order.sellPrice,
      }),
    },
    update: {},
  });
}

export async function getSmsPoolQuote(
  serviceId: number,
  countryId: number,
) {
  const [services, rates] = await Promise.all([
    getSmsPoolServices(),
    getSmsPoolSuccessRates(serviceId),
  ]);
  const service = services.find((item) => item.ID === serviceId);
  const country = rates.find((item) => item.country_id === countryId);
  if (!service || !country) throw new Error(SMSPOOL_NO_NUMBERS_MESSAGE);
  const providerCostUsd = smsPoolProviderPriceFloor(country);
  return {
    service,
    country,
    providerCostUsd,
    providerCostUsdCents: Math.ceil(providerCostUsd * 100),
    sellPrice: calculateSmsPoolSellPrice(providerCostUsd),
  };
}

type SmsPurchaseInput = {
  chatId: string;
  serviceId: number;
  countryId: number;
  idempotencyKey: string;
  buyer?: Buyer;
};

export async function purchaseSmsPoolForCustomer(input: SmsPurchaseInput) {
  if (!isPrivateTelegramChatId(input.chatId)) {
    throw new Error("Order SMS hanya dapat dibuat melalui chat pribadi bot");
  }
  return purchaseSmsPoolForOwner(input);
}

export async function purchaseSmsPoolForWebCustomer(input: {
  customerId: string; serviceId: number; countryId: number; idempotencyKey: string; expectedPrice: number;
}) {
  const customer = await prisma.webCustomer.findUnique({ where: { id: input.customerId }, select: { id: true, clerkUserId: true } });
  if (!customer?.clerkUserId) throw new Error("sms_account_required");
  const chatId = webCustomerChatId(customer.id);
  const idempotencyKey = `web-sms:${customer.id}:${input.idempotencyKey}`;
  const existing = await prisma.smsPoolCustomerOrder.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.chatId !== chatId || existing.serviceId !== input.serviceId || existing.countryId !== input.countryId) throw new Error("sms_request_conflict");
    return existing;
  }
  try {
    return await purchaseSmsPoolForOwner({ ...input, chatId, idempotencyKey, buyer: { first_name: "Pembeli website" } }, input.expectedPrice);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const concurrent = await prisma.smsPoolCustomerOrder.findUnique({ where: { idempotencyKey } });
      if (concurrent?.chatId === chatId && concurrent.serviceId === input.serviceId && concurrent.countryId === input.countryId) return concurrent;
    }
    throw error;
  }
}

async function purchaseSmsPoolForOwner(input: SmsPurchaseInput, expectedPrice?: number) {
  const identity = normalizeBuyerIdentity({
    username: input.buyer?.username,
    firstName: input.buyer?.first_name,
    lastName: input.buyer?.last_name,
  });
  const quote = await getSmsPoolQuote(input.serviceId, input.countryId);
  if (expectedPrice !== undefined && (!Number.isSafeInteger(expectedPrice) || expectedPrice < 1 || quote.sellPrice !== expectedPrice)) throw new Error("sms_price_changed");
  await ensureWallet(input.chatId, identity);

  const prepared = await prisma.$transaction(async (tx) => {
    const existing = await tx.smsPoolCustomerOrder.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (expectedPrice !== undefined && (existing.chatId !== input.chatId || existing.serviceId !== input.serviceId || existing.countryId !== input.countryId)) throw new Error("sms_request_conflict");
      return { order: existing, created: false };
    }

    if (expectedPrice !== undefined && (await getMaintenanceState(tx)).enabled) throw new Error("sms_maintenance");

    const paymentMethods = await getPaymentMethodAvailability(tx);
    if (expectedPrice !== undefined && !paymentMethods.walletCheckoutEnabled) throw new Error("sms_wallet_disabled");
    assertCheckoutPaymentMethodEnabled("WALLET", paymentMethods);

    await applyWalletTransaction(tx, {
      chatId: input.chatId,
      amount: -quote.sellPrice,
      type: "SMS_PURCHASE_DEBIT",
      idempotencyKey: `sms-debit:${input.idempotencyKey}`,
      identity,
      note: `${quote.service.name} - ${quote.country.name}`,
    });
    const order = await tx.smsPoolCustomerOrder.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        chatId: input.chatId,
        ...identity,
        countryId: quote.country.country_id,
        countryName: quote.country.name,
        countryCode: quote.country.short_name,
        serviceId: quote.service.ID,
        serviceName: quote.service.name,
        providerCostUsdCents: quote.providerCostUsdCents,
        sellPrice: quote.sellPrice,
      },
    });
    return { order, created: true };
  });

  if (!prepared.created) return prepared.order;

  let purchase;
  try {
    purchase = await purchaseSmsPoolNumber({
      country: String(quote.country.country_id),
      service: String(quote.service.ID),
      maxPrice: quote.providerCostUsd.toFixed(2),
      pricingOption: "0",
      quantity: 1,
    });
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      const order = await tx.smsPoolCustomerOrder.findUniqueOrThrow({
        where: { id: prepared.order.id },
      });
      if (order.refundedAt) return;
      await applyWalletTransaction(tx, {
        chatId: order.chatId,
        amount: order.sellPrice,
        type: "SMS_PURCHASE_REFUND",
        idempotencyKey: `sms-refund:provider-failed:${order.id}`,
        note: "Provider SMS sementara tidak tersedia",
        actor: "SYSTEM",
      });
      await tx.smsPoolCustomerOrder.update({
        where: { id: order.id },
        data: {
          status: "FAILED",
          refundedAt: new Date(),
          failureReason: "PROVIDER_UNAVAILABLE",
        },
      });
    });
    throw new Error(
      error instanceof Error && error.message === SMSPOOL_NO_NUMBERS_MESSAGE
        ? SMSPOOL_NO_NUMBERS_MESSAGE
        : SMSPOOL_UNAVAILABLE_MESSAGE,
    );
  }

  const expirationSeconds = purchase.expiration ||
    (purchase.expires_in ? Math.floor(Date.now() / 1000) + purchase.expires_in : 0);
  const actualProviderCostUsd = resolveSmsPoolPurchaseCostUsd(
    purchase,
    quote.providerCostUsd,
  );
  const actualSellPrice = calculateSmsPoolSellPrice(actualProviderCostUsd);

  if (actualSellPrice > prepared.order.sellPrice) {
    await cancelSmsPoolOrder(purchase.order_id).catch(() => undefined);
    await prisma.$transaction(async (tx) => {
      const order = await tx.smsPoolCustomerOrder.findUniqueOrThrow({
        where: { id: prepared.order.id },
      });
      if (!order.refundedAt) {
        await applyWalletTransaction(tx, {
          chatId: order.chatId,
          amount: order.sellPrice,
          type: "SMS_PURCHASE_REFUND",
          idempotencyKey: `sms-refund:price-exceeded:${order.id}`,
          note: "Harga provider berubah melewati batas pembelian",
          actor: "SYSTEM",
        });
      }
      await tx.smsPoolCustomerOrder.update({
        where: { id: order.id },
        data: {
          status: "FAILED",
          refundedAt: order.refundedAt ?? new Date(),
          failureReason: "PROVIDER_PRICE_EXCEEDED",
        },
      });
    });
    throw new Error(SMSPOOL_UNAVAILABLE_MESSAGE);
  }

  return prisma.$transaction(async (tx) => {
    const difference = prepared.order.sellPrice - actualSellPrice;
    if (difference > 0) {
      await applyWalletTransaction(tx, {
        chatId: prepared.order.chatId,
        amount: difference,
        type: "SMS_PURCHASE_REFUND",
        idempotencyKey: `sms-refund:price-difference:${prepared.order.id}`,
        note: "Penyesuaian harga aktual provider SMS",
        actor: "SYSTEM",
      });
    }
    return tx.smsPoolCustomerOrder.update({
      where: { id: prepared.order.id },
      data: {
        providerOrderId: purchase.order_id,
        providerCostUsdCents: Math.ceil(actualProviderCostUsd * 100),
        sellPrice: actualSellPrice,
        phoneNumber: smsPoolPurchasePhoneNumber(purchase),
        providerStatus: "active",
        status: "ACTIVE",
        expiresAt: expirationSeconds ? new Date(expirationSeconds * 1000) : null,
      },
    });
  });
}

export async function purchaseSmsPoolBulkForCustomer(input: {
  chatId: string;
  serviceId: number;
  countryId: number;
  quantity: number;
  idempotencyKey: string;
  buyer?: Buyer;
}) {
  const quantity = normalizeSmsPoolBulkQuantity(input.quantity);
  const orders = [] as Awaited<ReturnType<typeof purchaseSmsPoolForCustomer>>[];

  for (let index = 0; index < quantity; index += 1) {
    try {
      orders.push(await purchaseSmsPoolForCustomer({
        chatId: input.chatId,
        serviceId: input.serviceId,
        countryId: input.countryId,
        idempotencyKey: `${input.idempotencyKey}:${index + 1}`,
        buyer: input.buyer,
      }));
    } catch (error) {
      if (orders.length === 0) throw error;
      break;
    }
  }

  return {
    orders,
    requestedQuantity: quantity,
    failedQuantity: quantity - orders.length,
  };
}

export async function refreshSmsPoolCustomerOrder(chatId: string, orderId: string) {
  let local = await prisma.smsPoolCustomerOrder.findFirst({
    where: { id: orderId, chatId },
  });
  if (!local || !local.providerOrderId) return local;
  if (local.status === "COMPLETED") {
    if (hasSmsPoolMessage(local)) {
      await enqueueSmsSuccessNotification(local);
      return local;
    }
    local = await repairFalseCompletedSmsPoolOrder(local);
  }
  if (local.status !== "ACTIVE") return local;

  const results = await Promise.allSettled([
    getSmsPoolActiveOrders(),
    getSmsPoolHistory(100),
  ]);
  const providerOrders = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (results.every((result) => result.status === "rejected")) {
    throw new Error(SMSPOOL_UNAVAILABLE_MESSAGE);
  }
  const provider = providerOrders.find(
    (item) => item.order_code === local.providerOrderId,
  );
  return updateSmsPoolOrderFromProvider(local, provider);
}

type LocalSmsPoolOrder = NonNullable<
  Awaited<ReturnType<typeof prisma.smsPoolCustomerOrder.findFirst>>
>;

async function repairFalseCompletedSmsPoolOrder(local: LocalSmsPoolOrder) {
  if (local.status !== "COMPLETED" || hasSmsPoolMessage(local)) return local;
  return prisma.$transaction(async (tx) => {
    const current = await tx.smsPoolCustomerOrder.findUniqueOrThrow({
      where: { id: local.id },
    });
    if (current.status !== "COMPLETED" || hasSmsPoolMessage(current)) return current;
    await tx.telegramNotification.deleteMany({
      where: {
        dedupeKey: {
          in: [`sms-otp:user:${current.id}`, `success-channel:sms:${current.id}`],
        },
      },
    });
    return tx.smsPoolCustomerOrder.update({
      where: { id: current.id },
      data: {
        status: "ACTIVE",
        completedAt: null,
        failureReason: null,
      },
    });
  });
}

async function refundSmsPoolOrderWithoutCode(
  local: LocalSmsPoolOrder,
  providerStatus: string,
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.smsPoolCustomerOrder.findUniqueOrThrow({
      where: { id: local.id },
    });
    if (current.refundedAt || current.status === "REFUNDED") return current;
    await applyWalletTransaction(tx, {
      chatId: current.chatId,
      amount: current.sellPrice,
      type: "SMS_PURCHASE_REFUND",
      idempotencyKey: `sms-refund:provider:${current.id}`,
      note: `Refund SMS tanpa kode ${current.serviceName}`,
      actor: "SYSTEM",
    });
    await tx.telegramNotification.deleteMany({
      where: {
        dedupeKey: {
          in: [`sms-otp:user:${current.id}`, `success-channel:sms:${current.id}`],
        },
      },
    });
    return tx.smsPoolCustomerOrder.update({
      where: { id: current.id },
      data: {
        status: "REFUNDED",
        providerStatus,
        refundedAt: new Date(),
        completedAt: null,
        failureReason: "PROVIDER_REFUNDED_WITHOUT_SMS",
      },
    });
  });
}

async function applySmsPoolResolvedState(
  local: LocalSmsPoolOrder,
  state: SmsPoolResolvedState,
  providerStatus: string,
) {
  if (state.kind === "REFUNDED") {
    return refundSmsPoolOrderWithoutCode(local, providerStatus);
  }
  if (state.kind === "ACTIVE") {
    return prisma.smsPoolCustomerOrder.update({
      where: { id: local.id },
      data: {
        status: "ACTIVE",
        providerStatus,
        completedAt: null,
        lastCheckedAt: new Date(),
      },
    });
  }
  const updated = await prisma.smsPoolCustomerOrder.update({
    where: { id: local.id },
    data: {
      otpCode: state.otpCode,
      fullCode: state.fullCode,
      providerStatus,
      status: "COMPLETED",
      completedAt: new Date(),
      lastCheckedAt: new Date(),
    },
  });
  await enqueueSmsSuccessNotification(updated);
  return updated;
}

async function updateSmsPoolOrderFromProvider(
  local: LocalSmsPoolOrder,
  provider: SmsPoolOrder | undefined,
) {
  if (provider) {
    const resolved = resolveSmsPoolOrderState(provider);
    if (resolved.kind !== "ACTIVE") {
      return applySmsPoolResolvedState(local, resolved, provider.status);
    }
  }
  const providerExpired = Boolean(
    local.expiresAt && local.expiresAt.getTime() <= Date.now(),
  ) || Boolean(provider && provider.time_left <= 0);
  if (!provider || providerExpired) {
    const check = await checkSmsPoolOrder(local.providerOrderId!).catch(() => null);
    if (check) {
      const resolved = resolveSmsPoolCheckState(check);
      if (resolved.kind !== "ACTIVE") {
        return applySmsPoolResolvedState(local, resolved, `check:${check.status}`);
      }
    }
  }
  return applySmsPoolResolvedState(
    local,
    { kind: "ACTIVE", otpCode: null, fullCode: null },
    provider?.status ?? "pending",
  );
}

export async function refreshActiveSmsPoolOrders(limit = 50) {
  const cutoff = new Date(Date.now() - 10_000);
  const localOrders = await prisma.smsPoolCustomerOrder.findMany({
    where: {
      providerOrderId: { not: null },
      OR: [
        {
          status: "ACTIVE",
          OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: cutoff } }],
        },
        {
          status: "COMPLETED",
          otpCode: null,
          OR: [{ fullCode: null }, { fullCode: "" }],
        },
      ],
    },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: Math.min(Math.max(limit, 1), 100),
  });
  if (localOrders.length === 0) return { checked: 0, completed: 0 };

  const results = await Promise.allSettled([
    getSmsPoolActiveOrders(),
    getSmsPoolHistory(100),
  ]);
  const providerOrders = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (results.every((result) => result.status === "rejected")) {
    throw new Error(SMSPOOL_UNAVAILABLE_MESSAGE);
  }
  const providerById = new Map(
    providerOrders.map((order) => [order.order_code, order]),
  );
  let completed = 0;
  for (const storedLocal of localOrders) {
    const local = await repairFalseCompletedSmsPoolOrder(storedLocal);
    const updated = await updateSmsPoolOrderFromProvider(
      local,
      local.providerOrderId ? providerById.get(local.providerOrderId) : undefined,
    );
    if (updated.status === "COMPLETED") completed += 1;
  }
  return { checked: localOrders.length, completed };
}

export async function cancelSmsPoolCustomerOrder(chatId: string, orderId: string) {
  let order = await prisma.smsPoolCustomerOrder.findFirst({
    where: { id: orderId, chatId },
  });
  if (!order) throw new Error("Order SMS tidak ditemukan");
  order = await repairFalseCompletedSmsPoolOrder(order);
  return cancelResolvedSmsPoolCustomerOrder(order, "CUSTOMER");
}

export async function cancelAllActiveSmsPoolCustomerOrders(chatId: string) {
  const orders = await prisma.smsPoolCustomerOrder.findMany({
    where: {
      chatId,
      refundedAt: null,
      OR: [
        { status: "ACTIVE" },
        {
          status: "COMPLETED",
          otpCode: null,
          OR: [{ fullCode: null }, { fullCode: "" }],
        },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  let cancelled = 0;
  let skipped = 0;
  for (const order of orders) {
    try {
      await cancelResolvedSmsPoolCustomerOrder(
        await repairFalseCompletedSmsPoolOrder(order),
        "CUSTOMER_BULK",
      );
      cancelled += 1;
    } catch {
      skipped += 1;
    }
  }
  return { cancelled, skipped, total: orders.length };
}

async function cancelResolvedSmsPoolCustomerOrder(
  order: Awaited<ReturnType<typeof prisma.smsPoolCustomerOrder.findFirst>> & {},
  actor: string,
) {
  if (order.refundedAt || order.status === "REFUNDED") return order;
  if (!order.providerOrderId || order.status !== "ACTIVE") {
    throw new Error("Order SMS ini tidak dapat dibatalkan");
  }

  await cancelSmsPoolOrder(order.providerOrderId);
  return prisma.$transaction(async (tx) => {
    const current = await tx.smsPoolCustomerOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    if (current.refundedAt) return current;
    await applyWalletTransaction(tx, {
      chatId: current.chatId,
      amount: current.sellPrice,
      type: "SMS_PURCHASE_REFUND",
      idempotencyKey: `sms-refund:cancel:${current.id}`,
      note: `Refund SMS ${current.serviceName}`,
      actor,
    });
    return tx.smsPoolCustomerOrder.update({
      where: { id: current.id },
      data: {
        status: "REFUNDED",
        providerStatus: "cancelled",
        refundedAt: new Date(),
      },
    });
  });
}

export async function cancelSmsPoolCustomerOrderByAdmin(
  orderId: string,
  actor: string,
) {
  let order = await prisma.smsPoolCustomerOrder.findFirst({
    where: {
      OR: [{ id: orderId }, { providerOrderId: orderId }],
    },
  });
  if (!order) return null;
  order = await repairFalseCompletedSmsPoolOrder(order);
  return cancelResolvedSmsPoolCustomerOrder(order, `ADMIN:${actor}`);
}
