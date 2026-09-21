import { randomUUID } from "node:crypto";
import { booleanEnv, integerEnv } from "@/server/env";
import { prisma } from "@/server/db/prisma";
import { runIdempotentTransactionWithRetry } from "@/server/db/transaction-retry";
import { allocateUniqueCode } from "@/server/checkout/payment-amount";
import { registerWalletTopupClaim } from "@/server/payment/relay-client";
import { applyWalletTransaction } from "@/server/wallet/ledger";
import { walletTopupSuccessDedupeKey } from "@/server/telegram/delivery-key";
import { getPaymentMethodAvailability } from "@/server/payment/method-availability";
import {
  JAGO_TRANSFER_METHOD,
} from "@/server/payment/android-payment-provider";
import { getJagoTransferSetting } from "@/server/payment/jago-transfer-setting";
import { jagoTransferConfirmationBlockReason } from "@/server/payment/jago-transfer-policy";
import { isPaymentEventWithinWindow } from "@/server/payment/window";
import { DANA_WALLET_TOPUP_METHOD } from "@/server/payment/provider-methods";
import {
  assertQrisEvidenceIdempotency,
  createQrisInvoiceAttempt,
  type QrisInvoiceEvidenceMode,
} from "@/server/payment/qris-merchant-service";
import { qrisProviderUsesDanaRelay } from "@/server/payment/qris-provider-registry";
import { qrisInvoiceEventBlockReason } from "@/server/payment/qris-attempt-policy";
import { shopeePartnerTransactionBlockReason } from "@/server/payment/shopee-partner-matching";
import { assertShopeeAndroidFallbackGraceElapsed } from "@/server/payment/shopee-partner-fallback";
import { isAdminShopeePaymentOverride } from "@/server/payment/shopee-manual-policy";

export { DANA_WALLET_TOPUP_METHOD } from "@/server/payment/provider-methods";

export const WALLET_TOPUP_PRESETS = [10_000, 25_000, 50_000, 100_000] as const;
export type WalletTopupPaymentMethod =
  | typeof DANA_WALLET_TOPUP_METHOD
  | typeof JAGO_TRANSFER_METHOD;

function normalizeWalletTopupPaymentMethod(
  value: WalletTopupPaymentMethod | undefined,
): WalletTopupPaymentMethod {
  return value ?? DANA_WALLET_TOPUP_METHOD;
}

export function walletTopupEventBlockReason(input: {
  walletTopupId: string;
  paymentMethod: string;
  billedAmount: number;
  createdAt: Date;
  expiresAt: Date;
  bridgeClaim: { claimId: string } | null;
  jagoTransferAttempt: {
    status: string;
    matchedEventId: string | null;
    expiresAt: Date;
  } | null;
  qrisInvoiceAttempt?: {
    evidenceMode?: string;
    providerKeySnapshot: string;
    allowedPackageNamesSnapshot: readonly string[];
    allowedDeviceIdsSnapshot: readonly string[];
    amount: number;
    status: string;
    matchedEventId: string | null;
    expiresAt: Date;
  } | null;
  event: {
    eventId: string;
    source: string;
    provider: string | null;
    claimId: string | null;
    deviceId: string | null;
    packageName: string | null;
    amount: number | null;
    postedAt: Date;
    status: string;
    orderId: string | null;
    walletTopupId: string | null;
  };
  allowRejectedEvent: boolean;
  allowShopeeAndroidFallback?: boolean;
}): string | null {
  if (
    input.event.status !== "RECEIVED" &&
    !(input.allowRejectedEvent && input.event.status === "REJECTED")
  ) {
    return "Wallet top up bridge event is not available for confirmation";
  }
  if (
    input.event.orderId ||
    (input.event.walletTopupId &&
      input.event.walletTopupId !== input.walletTopupId)
  ) {
    return "Wallet top up bridge event is already linked to another target";
  }
  if (input.event.amount !== input.billedAmount) {
    return "Wallet top up bridge event amount mismatch";
  }
  if (
    !isPaymentEventWithinWindow({
      postedAt: input.event.postedAt,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    })
  ) {
    return "Wallet top up bridge event is outside the invoice window";
  }

  if (input.paymentMethod === JAGO_TRANSFER_METHOD) {
    return jagoTransferConfirmationBlockReason({
      bridgeEventId: input.event.eventId,
      payment: {
        billedAmount: input.billedAmount,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
      },
      attempt: input.jagoTransferAttempt,
      event: input.allowRejectedEvent
        ? { ...input.event, status: "RECEIVED" }
        : input.event,
    });
  }
  if (input.paymentMethod !== DANA_WALLET_TOPUP_METHOD) {
    return "Wallet top up payment method is not supported";
  }
  return qrisInvoiceEventBlockReason({
    targetKind: "wallet_topup",
    targetId: input.walletTopupId,
    billedAmount: input.billedAmount,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    bridgeClaim: input.bridgeClaim,
    attempt: input.qrisInvoiceAttempt ?? null,
    event: input.event,
    allowRejectedEvent: input.allowRejectedEvent,
    allowShopeeAndroidFallback: input.allowShopeeAndroidFallback,
  });
}

function topupInvoiceNumber(): string {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `TOP-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export function validateWalletTopupAmount(amount: number): number {
  if (!WALLET_TOPUP_PRESETS.includes(amount as (typeof WALLET_TOPUP_PRESETS)[number])) {
    throw new Error("Pilih nominal top up yang tersedia");
  }
  return amount;
}

export async function createWalletTopup(input: {
  chatId: string;
  amount: number;
  idempotencyKey: string;
  paymentMethod?: WalletTopupPaymentMethod;
  buyerUsername?: string | null;
  buyerDisplayName?: string | null;
  qrisEvidenceMode?: QrisInvoiceEvidenceMode;
  shopeeSessionId?: string | null;
}) {
  const baseAmount = validateWalletTopupAmount(input.amount);
  const paymentMethod = normalizeWalletTopupPaymentMethod(input.paymentMethod);
  if (
    (input.qrisEvidenceMode || input.shopeeSessionId) &&
    paymentMethod !== DANA_WALLET_TOPUP_METHOD
  ) {
    throw new Error("Mode bukti QRIS hanya boleh dipakai pada top up QRIS");
  }
  const existing = await prisma.walletTopup.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { bridgeClaim: true, qrisInvoiceAttempt: true, jagoTransferAttempt: true },
  });
  if (existing) {
    assertQrisEvidenceIdempotency({
      attempt: existing.qrisInvoiceAttempt,
      evidenceMode: input.qrisEvidenceMode,
      shopeeSessionId: input.shopeeSessionId,
    });
    if (
      existing.baseAmount !== baseAmount ||
      existing.paymentMethod !== paymentMethod
    ) {
      throw new Error("Idempotency key top up sudah dipakai untuk invoice berbeda");
    }
    if (
      (paymentMethod === DANA_WALLET_TOPUP_METHOD &&
        existing.bridgeClaim?.status === "PENDING") ||
      (paymentMethod === DANA_WALLET_TOPUP_METHOD &&
        existing.bridgeClaim?.status === "FAILED")
    ) {
      if (
        !existing.qrisInvoiceAttempt ||
        qrisProviderUsesDanaRelay(
          existing.qrisInvoiceAttempt.providerKeySnapshot,
        )
      ) {
        await registerWalletTopupClaim(existing.id);
      }
    }
    return existing;
  }

  const topup = await runIdempotentTransactionWithRetry(
    () =>
      prisma.$transaction(async (tx) => {
        const lockedExisting = await tx.walletTopup.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { bridgeClaim: true, qrisInvoiceAttempt: true, jagoTransferAttempt: true },
        });
        if (lockedExisting) {
          assertQrisEvidenceIdempotency({
            attempt: lockedExisting.qrisInvoiceAttempt,
            evidenceMode: input.qrisEvidenceMode,
            shopeeSessionId: input.shopeeSessionId,
          });
          if (
            lockedExisting.baseAmount !== baseAmount ||
            lockedExisting.paymentMethod !== paymentMethod
          ) {
            throw new Error(
              "Idempotency key top up sudah dipakai untuk invoice berbeda",
            );
          }
          return lockedExisting;
        }

        const paymentMethods = await getPaymentMethodAvailability(tx);
        if (!paymentMethods.walletTopupEnabled) {
          throw new Error("Top up wallet sedang dinonaktifkan admin.");
        }
        if (!paymentMethods.walletCheckoutEnabled) {
          throw new Error("Top up wallet memerlukan wallet checkout aktif.");
        }
        if (
          paymentMethod === DANA_WALLET_TOPUP_METHOD &&
          !paymentMethods.qrisDanaEnabled
        ) {
          throw new Error(
            "Top up wallet melalui QRIS/DANA sedang dinonaktifkan admin.",
          );
        }
        if (
          paymentMethod === JAGO_TRANSFER_METHOD &&
          !paymentMethods.jagoTransferEnabled
        ) {
          throw new Error(
            "Top up wallet melalui Bank Jago sedang dinonaktifkan admin.",
          );
        }
        const jagoSetting =
          paymentMethod === JAGO_TRANSFER_METHOD
            ? await getJagoTransferSetting(tx)
            : null;
        if (
          paymentMethod === JAGO_TRANSFER_METHOD &&
          (!jagoSetting?.enabled || !jagoSetting.accountNumber)
        ) {
          throw new Error(
            "Top up wallet melalui Bank Jago sedang tidak tersedia.",
          );
        }

        await tx.wallet.upsert({
          where: { chatId: input.chatId },
          create: {
            chatId: input.chatId,
            buyerUsername:
              input.buyerUsername?.trim().replace(/^@/, "") || null,
            buyerDisplayName: input.buyerDisplayName?.trim() || null,
          },
          update: {
            buyerUsername:
              input.buyerUsername?.trim().replace(/^@/, "") || undefined,
            buyerDisplayName: input.buyerDisplayName?.trim() || undefined,
          },
        });
        const uniqueCode = await allocateUniqueCode(tx, baseAmount);
        const expiresAt = new Date(
          Date.now() + integerEnv("PAYMENT_EXPIRY_MINUTES", 5) * 60_000,
        );
        const invoiceNumber = topupInvoiceNumber();
        const created = await tx.walletTopup.create({
          data: {
            id: randomUUID(),
            idempotencyKey: input.idempotencyKey,
            invoiceNumber,
            chatId: input.chatId,
            paymentMethod,
            baseAmount,
            uniqueCode,
            billedAmount: baseAmount + uniqueCode,
            expiresAt,
            ...(paymentMethod === JAGO_TRANSFER_METHOD &&
            jagoSetting?.accountNumber
              ? {
                  jagoTransferAttempt: {
                    create: {
                      recipientAccountNumberSnapshot:
                        jagoSetting.accountNumber,
                      expiresAt,
                    },
                  },
                }
              : {}),
          },
          include: { bridgeClaim: true, qrisInvoiceAttempt: true, jagoTransferAttempt: true },
        });
        if (paymentMethod === DANA_WALLET_TOPUP_METHOD) {
          const qrisAttempt = await createQrisInvoiceAttempt(
            {
              walletTopupId: created.id,
              amount: created.billedAmount,
              expiresAt,
              evidenceMode: input.qrisEvidenceMode,
              shopeeSessionId: input.shopeeSessionId,
            },
            tx,
          );
          if (qrisProviderUsesDanaRelay(qrisAttempt.providerKeySnapshot)) {
            await tx.bridgePaymentClaim.create({
              data: {
                claimId: randomUUID(),
                walletTopupId: created.id,
                amount: created.billedAmount,
                expiresAt,
              },
            });
          }
        }
        return tx.walletTopup.findUniqueOrThrow({
          where: { id: created.id },
          include: { bridgeClaim: true, qrisInvoiceAttempt: true, jagoTransferAttempt: true },
        });
      }),
    { label: "create-wallet-topup" },
  );

  if (topup.bridgeClaim) {
    await registerWalletTopupClaim(topup.id);
  }
  return prisma.walletTopup.findUniqueOrThrow({
    where: { id: topup.id },
    include: { bridgeClaim: true, qrisInvoiceAttempt: true, jagoTransferAttempt: true },
  });
}

export async function confirmWalletTopup(input: {
  walletTopupId: string;
  verifiedBy: string;
  bridgeEventId?: string;
  shopeePartnerTransactionId?: string;
  allowManualTransferOverride?: boolean;
}) {
  return runIdempotentTransactionWithRetry(
    () =>
      prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_topup_${input.walletTopupId}`}))`;
    const topup = await tx.walletTopup.findUnique({
      where: { id: input.walletTopupId },
      include: { bridgeClaim: true, qrisInvoiceAttempt: true, jagoTransferAttempt: true },
    });
    if (!topup) throw new Error("Top up tidak ditemukan");

    const bridgeEvent = input.bridgeEventId
      ? await tx.bridgePaymentEvent.findUnique({
          where: { eventId: input.bridgeEventId },
          select: {
            id: true,
            eventId: true,
            source: true,
            provider: true,
            claimId: true,
            deviceId: true,
            packageName: true,
            amount: true,
            postedAt: true,
            receivedAt: true,
            status: true,
            orderId: true,
            walletTopupId: true,
          },
        })
      : null;
    const shopeeTransaction =
      input.shopeePartnerTransactionId &&
      topup.qrisInvoiceAttempt?.shopeeAccountFingerprintSnapshot
        ? await tx.shopeePartnerTransaction.findFirst({
            where: {
              externalTransactionId: input.shopeePartnerTransactionId,
              merchantAccountFingerprint:
                topup.qrisInvoiceAttempt.shopeeAccountFingerprintSnapshot,
            },
            select: {
              id: true,
              externalTransactionId: true,
              merchantAccountFingerprint: true,
              service: true,
              transactionType: true,
              statusCode: true,
              amount: true,
              occurredAt: true,
              status: true,
              qrisInvoiceAttemptId: true,
            },
          })
        : null;
    const usesShopeeWebEvidence =
      topup.qrisInvoiceAttempt?.evidenceMode === "WEB_SESSION";
    const manualShopeeConfirmation = isAdminShopeePaymentOverride({
      evidenceMode: topup.qrisInvoiceAttempt?.evidenceMode,
      providerKey: topup.qrisInvoiceAttempt?.providerKeySnapshot,
      verifiedBy: input.verifiedBy,
      allowOverride: input.allowManualTransferOverride,
      bridgeEventId: input.bridgeEventId,
      shopeeTransactionId: input.shopeePartnerTransactionId,
    });
    const allowShopeeAndroidFallback =
      booleanEnv("SHOPEE_ANDROID_FALLBACK_ENABLED", true) &&
      topup.qrisInvoiceAttempt?.providerKeySnapshot === "SHOPEE_PARTNER";
    if (usesShopeeWebEvidence) {
      if (
        !topup.qrisInvoiceAttempt ||
        topup.qrisInvoiceAttempt.amount !== topup.billedAmount ||
        topup.qrisInvoiceAttempt.expiresAt.getTime() !== topup.expiresAt.getTime()
      ) {
        throw new Error("Shopee invoice snapshot amount or expiry mismatch");
      }
      if (input.bridgeEventId && !allowShopeeAndroidFallback) {
        throw new Error("Shopee web-session top up cannot use Android bridge evidence");
      }
      if (input.bridgeEventId && bridgeEvent && allowShopeeAndroidFallback) {
        assertShopeeAndroidFallbackGraceElapsed({ receivedAt: bridgeEvent.receivedAt });
      }
      if (input.shopeePartnerTransactionId) {
        const blockReason = shopeePartnerTransactionBlockReason({
          transaction: shopeeTransaction ?? {
            externalTransactionId: input.shopeePartnerTransactionId,
            merchantAccountFingerprint: "",
            service: 0,
            transactionType: 0,
            statusCode: 0,
            amount: 0,
            occurredAt: new Date(0),
            status: "MISSING",
            qrisInvoiceAttemptId: null,
          },
          invoiceAttempt: topup.qrisInvoiceAttempt!,
          allowConfirmed: topup.status === "PAID",
        });
        if (blockReason) throw new Error(blockReason);
      } else if (topup.status !== "PAID" && !manualShopeeConfirmation) {
        throw new Error("Shopee web-session transaction evidence is required");
      }
    } else if (input.shopeePartnerTransactionId) {
      throw new Error("Shopee transaction evidence is not attached to this top up");
    }

    if (topup.status === "PAID") {
      if (!input.bridgeEventId) return topup;
      if (
        !bridgeEvent ||
        bridgeEvent.status !== "CONFIRMED" ||
        bridgeEvent.walletTopupId !== topup.id ||
        bridgeEvent.orderId
      ) {
        throw new Error("Top up sudah dibayar oleh event pembayaran lain");
      }
      return topup;
    }
    if (topup.status !== "PENDING") throw new Error("Top up tidak menunggu pembayaran");
    if (topup.expiresAt <= new Date()) throw new Error("Invoice top up sudah kedaluwarsa");
    if (
      !input.bridgeEventId &&
      !shopeeTransaction &&
      !(
        input.allowManualTransferOverride === true &&
        input.verifiedBy.startsWith("admin:")
      )
    ) {
      throw new Error("Manual wallet top up confirmation requires admin approval");
    }
    if (input.bridgeEventId) {
      if (!bridgeEvent) throw new Error("Event pembayaran top up tidak ditemukan");
      const blockReason = walletTopupEventBlockReason({
        walletTopupId: topup.id,
        paymentMethod: topup.paymentMethod,
        billedAmount: topup.billedAmount,
        createdAt: topup.createdAt,
        expiresAt: topup.expiresAt,
        bridgeClaim: topup.bridgeClaim,
        jagoTransferAttempt: topup.jagoTransferAttempt,
        qrisInvoiceAttempt: topup.qrisInvoiceAttempt,
        event: bridgeEvent,
        allowRejectedEvent: input.verifiedBy.startsWith("admin:"),
        allowShopeeAndroidFallback,
      });
      if (blockReason) throw new Error(blockReason);
    }

    const now = new Date();
    await tx.walletTopup.update({
      where: { id: topup.id },
      data: { status: "PAID", verifiedBy: input.verifiedBy, verifiedAt: now },
    });
    await applyWalletTransaction(tx, {
      chatId: topup.chatId,
      amount: topup.baseAmount,
      type: "TOPUP_CREDIT",
      idempotencyKey: `topup-credit:${topup.id}`,
      walletTopupId: topup.id,
      actor: input.verifiedBy,
      note: `Top up ${topup.invoiceNumber}`,
    });
    if (topup.paymentMethod === DANA_WALLET_TOPUP_METHOD) {
      if (topup.qrisInvoiceAttempt) {
        const attemptUpdated = await tx.qrisInvoiceAttempt.updateMany({
          where: {
            id: topup.qrisInvoiceAttempt.id,
            status: { in: ["AWAITING_PAYMENT", "MATCHED"] },
            matchedEventId: null,
          },
          data: {
            status: "CONFIRMED",
            matchedEventId: bridgeEvent?.id ?? null,
            matchedAt: bridgeEvent ? now : null,
          },
        });
        if (attemptUpdated.count !== 1) {
          throw new Error("QRIS wallet top up state changed during confirmation");
        }
      }
      if (shopeeTransaction?.id) {
        const transactionUpdated = await tx.shopeePartnerTransaction.updateMany({
          where: {
            id: shopeeTransaction.id,
            qrisInvoiceAttemptId: topup.qrisInvoiceAttempt?.id,
            status: "MATCHED",
          },
          data: { status: "CONFIRMED", confirmedAt: now },
        });
        if (transactionUpdated.count !== 1) {
          throw new Error("Shopee transaction state changed during confirmation");
        }
      }
      await tx.bridgePaymentClaim.updateMany({
        where: { walletTopupId: topup.id },
        data: { status: "CONFIRMED", confirmedAt: now },
      });
    }
    if (topup.paymentMethod === JAGO_TRANSFER_METHOD) {
      const attemptUpdated = await tx.jagoWalletTopupAttempt.updateMany({
        where: {
          walletTopupId: topup.id,
          status: "AWAITING_TRANSFER",
          matchedEventId: null,
        },
        data: {
          status: "CONFIRMED",
          matchedEventId: input.bridgeEventId ?? null,
          matchedAt: now,
        },
      });
      if (attemptUpdated.count !== 1) {
        throw new Error("Jago wallet top up state changed during confirmation");
      }
    }
    const dedupeKey = walletTopupSuccessDedupeKey(topup.id);
    await tx.telegramNotification.upsert({
      where: { dedupeKey },
      create: {
        dedupeKey,
        chatId: topup.chatId,
        walletTopupId: topup.id,
        kind: "WALLET_TOPUP_SUCCESS",
        priority: 10,
      },
      update: {},
    });
    if (input.bridgeEventId) {
      await tx.bridgePaymentEvent.update({
        where: { eventId: input.bridgeEventId },
        data: {
          status: "CONFIRMED",
          walletTopupId: topup.id,
          confirmedAt: now,
        },
      });
    }
        return tx.walletTopup.findUniqueOrThrow({
          where: { id: topup.id },
          include: { bridgeClaim: true, qrisInvoiceAttempt: true, jagoTransferAttempt: true },
        });
      }),
    { label: "confirm-wallet-topup", maxAttempts: 3 },
  );
}

export async function expirePendingWalletTopups(limit = 100): Promise<number> {
  const candidates = await prisma.walletTopup.findMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });
  let expired = 0;
  for (const candidate of candidates) {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.walletTopup.updateMany({
        where: { id: candidate.id, status: "PENDING", expiresAt: { lte: new Date() } },
        data: { status: "EXPIRED" },
      });
      if (result.count === 0) return false;
      await tx.bridgePaymentClaim.updateMany({
        where: { walletTopupId: candidate.id },
        data: { status: "EXPIRED" },
      });
      await tx.jagoWalletTopupAttempt.updateMany({
        where: {
          walletTopupId: candidate.id,
          status: "AWAITING_TRANSFER",
          matchedEventId: null,
        },
        data: { status: "EXPIRED" },
      });
      await tx.qrisInvoiceAttempt.updateMany({
        where: {
          walletTopupId: candidate.id,
          status: { in: ["AWAITING_PAYMENT", "MATCHED"] },
        },
        data: { status: "EXPIRED" },
      });
      return true;
    });
    if (updated) expired += 1;
  }
  return expired;
}
