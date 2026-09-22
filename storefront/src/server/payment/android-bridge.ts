import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { optionalEnv } from "@/server/env";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import {
  androidPaymentProviderForPackage,
  type AndroidPaymentProvider,
} from "@/server/payment/android-payment-provider";
import { existingBridgeEventDisposition } from "@/server/payment/bridge-event-state";
import { confirmWalletTopup } from "@/server/wallet/topup";
import { sha256 } from "@/server/security/crypto";
import {
  isPaymentEventWithinWindow,
  PAYMENT_EVENT_CLOCK_SKEW_MS,
} from "@/server/payment/window";
import {
  orderPaymentMethodsForProvider,
  walletTopupPaymentMethodForProvider,
} from "@/server/payment/provider-methods";

export const ANDROID_BRIDGE_CLOCK_SKEW_MS = PAYMENT_EVENT_CLOCK_SKEW_MS;

const defaultIncomingPhrases = [
  "pembayaran diterima",
  "dana masuk",
  "uang masuk",
  "transaksi masuk",
  "pembayaran masuk",
  "kamu menerima",
  "anda menerima",
  "berhasil menerima",
  "menerima pembayaran",
  "menerima dana",
  "menerima saldo",
  "menerima uang",
  "dana diterima",
  "saldo masuk",
  "terima uang",
];

const defaultExcludedPhrases = [
  "cashback",
  "voucher",
  "promo",
  "hadiah",
  "bonus",
  "top up",
  "top-up",
  "isi ulang",
  "isi saldo",
  "refund",
  "pengembalian dana",
];

export type AndroidBridgePayload = {
  eventId: string;
  deviceId: string;
  packageName: string;
  title: string;
  body: string;
  postedAt: string;
};

export type AndroidBridgeClassification =
  | { status: "accepted"; provider: AndroidPaymentProvider; amount: number }
  | {
      status:
        | "rejected_package"
        | "ignored_content"
        | "parse_failed"
        | "ambiguous_amounts";
      reason: string;
    };

export type AndroidBridgeProcessResult =
  | {
      status: "confirmed";
      target: AndroidBridgePaymentTarget;
      amount: number;
    }
  | { status: "duplicate" }
  | {
      status:
        | "rejected_package"
        | "ignored_content"
        | "parse_failed"
        | "ambiguous_amounts"
        | "unmatched"
        | "ambiguous";
    };

type BeginResult = "new" | "retry" | "duplicate";

export type AndroidBridgePaymentTarget =
  | { kind: "order"; id: string }
  | { kind: "wallet_topup"; id: string };

export type AndroidBridgeProcessorDependencies = {
  beginEvent(input: AndroidBridgePayload, rawBody: string): Promise<BeginResult>;
  recordAmount(
    eventId: string,
    provider: AndroidPaymentProvider,
    amount: number,
  ): Promise<void>;
  rejectEvent(eventId: string, reason: string, amount?: number): Promise<void>;
  findMatchingTargets(
    provider: AndroidPaymentProvider,
    packageName: string,
    deviceId: string,
    amount: number,
    postedAt: Date,
  ): Promise<AndroidBridgePaymentTarget[]>;
  confirmPayment(target: AndroidBridgePaymentTarget, eventId: string): Promise<void>;
};

export function androidOrderPaymentMethods(
  provider: AndroidPaymentProvider,
): readonly string[] {
  return orderPaymentMethodsForProvider(provider);
}

export function androidWalletTopupPaymentMethod(
  provider: AndroidPaymentProvider,
): string {
  return walletTopupPaymentMethodForProvider(provider);
}

function configuredPhrases(name: string, defaults: string[]): string[] {
  const configured = optionalEnv(name);
  if (!configured) return defaults;
  return configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function parseRupiahAmounts(value: string): number[] {
  const amounts = new Set<number>();
  const pattern = /(?:^|[\s(:])rp\.?\s*([0-9][0-9.,]*)/gi;

  for (const match of value.matchAll(pattern)) {
    const rawAmount = match[1]?.replace(/[.,]00$/, "") ?? "";
    const digits = rawAmount.replace(/[^0-9]/g, "");
    if (!digits) continue;
    const amount = Number(digits);
    if (Number.isSafeInteger(amount) && amount > 0 && amount <= 2_147_483_647) {
      amounts.add(amount);
    }
  }

  return [...amounts];
}

export function classifyAndroidBridgePayload(
  payload: AndroidBridgePayload,
  input: { incomingPhrases?: string[]; excludedPhrases?: string[] } = {},
): AndroidBridgeClassification {
  const provider = androidPaymentProviderForPackage(payload.packageName);
  if (!provider) {
    return { status: "rejected_package", reason: "Source package is not allowed" };
  }

  const content = `${payload.title}\n${payload.body}`.toLowerCase();
  const excludedPhrases = input.excludedPhrases ?? defaultExcludedPhrases;
  if (excludedPhrases.some((phrase) => content.includes(phrase))) {
    return { status: "ignored_content", reason: "Notification is not incoming money" };
  }

  const incomingRecognized = (() => {
    if (provider === "JAGO") {
      return (/\btelah\s+mengirim\b/.test(content) && /\bke\s+kamu\b/.test(content)) ||
        (/\bkamu\s+menerima(?:\s+kiriman)?\s+rp\.?\s*[0-9]/.test(content) &&
          /\bdari\b/.test(content));
    }
    if (provider === "SHOPEE_PARTNER") {
      const exactIncoming = /^pembayaran\s+sebesar\s+rp\.?\s*[0-9][0-9.,]*\s+telah\s+diterima\s+pada\s+transaksi\s+\S(?:.*\S)?\.?$/i;
      return [payload.title, payload.body].some((value) =>
        exactIncoming.test(value.trim()),
      );
    }
    return (input.incomingPhrases ?? defaultIncomingPhrases).some((phrase) =>
      content.includes(phrase),
    );
  })();
  if (!incomingRecognized) {
    return { status: "ignored_content", reason: "Incoming payment phrase not recognized" };
  }

  const amounts = parseRupiahAmounts(content);
  if (amounts.length === 0) {
    return { status: "parse_failed", reason: "No Rupiah amount found" };
  }
  if (amounts.length !== 1) {
    return { status: "ambiguous_amounts", reason: "More than one Rupiah amount found" };
  }
  return { status: "accepted", provider, amount: amounts[0] };
}

export function isWithinPaymentWindow(input: {
  postedAt: Date;
  createdAt: Date;
  expiresAt: Date;
  skewMs?: number;
}): boolean {
  return isPaymentEventWithinWindow(input);
}

export async function processAndroidBridgeNotification(
  payload: AndroidBridgePayload,
  rawBody: string,
  dependencies: AndroidBridgeProcessorDependencies = prismaAndroidBridgeDependencies,
): Promise<AndroidBridgeProcessResult> {
  const beginResult = await dependencies.beginEvent(payload, rawBody);
  if (beginResult === "duplicate") return { status: "duplicate" };

  const classification = classifyAndroidBridgePayload(payload, {
    incomingPhrases: configuredPhrases(
      "DANA_ANDROID_BRIDGE_INCOMING_PHRASES",
      defaultIncomingPhrases,
    ),
    excludedPhrases: configuredPhrases(
      "DANA_ANDROID_BRIDGE_EXCLUDED_PHRASES",
      defaultExcludedPhrases,
    ),
  });
  if (classification.status !== "accepted") {
    await dependencies.rejectEvent(
      payload.eventId,
      `${classification.status}: ${classification.reason}`,
    );
    return { status: classification.status };
  }

  await dependencies.recordAmount(
    payload.eventId,
    classification.provider,
    classification.amount,
  );
  const postedAt = new Date(payload.postedAt);
  const matches = await dependencies.findMatchingTargets(
    classification.provider,
    payload.packageName,
    payload.deviceId,
    classification.amount,
    postedAt,
  );
  if (matches.length === 0) {
    await dependencies.rejectEvent(
      payload.eventId,
      "unmatched: No active payment matches amount and time window",
      classification.amount,
    );
    return { status: "unmatched" };
  }
  if (matches.length !== 1) {
    await dependencies.rejectEvent(
      payload.eventId,
      "ambiguous: More than one active payment matches amount and time window",
      classification.amount,
    );
    return { status: "ambiguous" };
  }

  await dependencies.confirmPayment(matches[0], payload.eventId);
  return {
    status: "confirmed",
    target: matches[0],
    amount: classification.amount,
  };
}

const prismaAndroidBridgeDependencies: AndroidBridgeProcessorDependencies = {
  async beginEvent(payload, rawBody) {
    const payloadHash = sha256(rawBody);
    try {
      await prisma.bridgePaymentEvent.create({
        data: {
          eventId: payload.eventId,
          source: "ANDROID",
          deviceId: payload.deviceId,
          packageName: payload.packageName,
          postedAt: new Date(payload.postedAt),
          payloadHash,
        },
      });
      return "new";
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }
      const existing = await prisma.bridgePaymentEvent.findUniqueOrThrow({
        where: { eventId: payload.eventId },
        select: { status: true, payloadHash: true },
      });
      return existingBridgeEventDisposition({
        status: existing.status,
        payloadHash: existing.payloadHash,
        expectedPayloadHash: payloadHash,
      });
    }
  },

  async recordAmount(eventId, provider, amount) {
    await prisma.bridgePaymentEvent.update({
      where: { eventId },
      data: { provider, amount },
    });
  },

  async rejectEvent(eventId, reason, amount) {
    await prisma.bridgePaymentEvent.update({
      where: { eventId },
      data: {
        status: "REJECTED",
        reason: reason.slice(0, 500),
        ...(amount === undefined ? {} : { amount }),
      },
    });
  },

  async findMatchingTargets(provider, packageName, deviceId, amount, postedAt) {
    const earliestCreatedAt = new Date(
      postedAt.getTime() + ANDROID_BRIDGE_CLOCK_SKEW_MS,
    );
    const latestExpiry = new Date(
      postedAt.getTime() - ANDROID_BRIDGE_CLOCK_SKEW_MS,
    );
    const includeLegacyQris = (provider as string) === "DANA";
    const paymentMethods = [...androidOrderPaymentMethods(provider)];
    const [payments, topups] = await Promise.all([
      prisma.payment.findMany({
        where: {
          billedAmount: amount,
          status: "PENDING",
          // A notification can only settle invoices owned by its provider.
          method: { in: paymentMethods },
          createdAt: { lte: earliestCreatedAt },
          expiresAt: { gte: latestExpiry },
          order: {
            is: { status: "PENDING_PAYMENT", paymentStatus: "PENDING" },
          },
          ...(provider !== "JAGO"
            ? {
                OR: [
                  ...(includeLegacyQris
                    ? [{ order: { is: { qrisInvoiceAttempt: null } } }]
                    : []),
                  {
                    order: {
                      is: {
                        qrisInvoiceAttempt: {
                          is: {
                            providerKeySnapshot: provider,
                            allowedPackageNamesSnapshot: { has: packageName },
                            allowedDeviceIdsSnapshot: { has: deviceId },
                            amount,
                            status: "AWAITING_PAYMENT",
                            matchedEventId: null,
                            expiresAt: { gte: latestExpiry },
                          },
                        },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        select: { orderId: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: "asc" },
        take: 2,
      }),
      prisma.walletTopup.findMany({
        where: {
          paymentMethod:
            androidWalletTopupPaymentMethod(provider),
          billedAmount: amount,
          status: "PENDING",
          createdAt: { lte: earliestCreatedAt },
          expiresAt: { gte: latestExpiry },
          ...(provider === "JAGO"
            ? {
                jagoTransferAttempt: {
                  is: {
                    status: "AWAITING_TRANSFER",
                    matchedEventId: null,
                    expiresAt: { gte: latestExpiry },
                  },
                },
              }
            : {
                  OR: [
                    ...(includeLegacyQris
                      ? [{ qrisInvoiceAttempt: null }]
                      : []),
                    {
                      qrisInvoiceAttempt: {
                        is: {
                          providerKeySnapshot: provider,
                          allowedPackageNamesSnapshot: { has: packageName },
                          allowedDeviceIdsSnapshot: { has: deviceId },
                          amount,
                          status: "AWAITING_PAYMENT",
                          matchedEventId: null,
                          expiresAt: { gte: latestExpiry },
                        },
                      },
                    },
                  ],
                }),
        },
        select: { id: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: "asc" },
        take: 2,
      }),
    ]);
    const orderTargets: AndroidBridgePaymentTarget[] = payments
      .filter((payment) =>
        isWithinPaymentWindow({
          postedAt,
          createdAt: payment.createdAt,
          expiresAt: payment.expiresAt,
        }),
      )
      .map((payment) => ({ kind: "order", id: payment.orderId }));
    const topupTargets: AndroidBridgePaymentTarget[] = topups
      .filter((topup) =>
        isWithinPaymentWindow({
          postedAt,
          createdAt: topup.createdAt,
          expiresAt: topup.expiresAt,
        }),
      )
      .map((topup) => ({ kind: "wallet_topup", id: topup.id }));
    return [...orderTargets, ...topupTargets].slice(0, 2);
  },

  async confirmPayment(target, eventId) {
    if (target.kind === "order") {
      await confirmOrderPayment({
        orderId: target.id,
        verifiedBy: `android:${eventId}`,
        bridgeEventId: eventId,
      });
      return;
    }
    await confirmWalletTopup({
      walletTopupId: target.id,
      verifiedBy: `android:${eventId}`,
      bridgeEventId: eventId,
    });
  },
};

export async function recordAndroidBridgeHeartbeat(input: {
  deviceId: string;
  queueSize: number;
  pendingQueueSize?: number;
  blockedQueueSize?: number;
  oldestQueuedAt?: string | null;
  highestAttemptCount?: number;
  lastErrorCode?: string | null;
  appVersion?: string;
  appVersionCode?: number;
  listenerConnected?: boolean;
  queueStorageVersion?: number;
}): Promise<void> {
  const now = new Date();
  const diagnostics = {
    queueSize: input.queueSize,
    pendingQueueSize: input.pendingQueueSize ?? input.queueSize,
    blockedQueueSize: input.blockedQueueSize ?? 0,
    oldestQueuedAt: input.oldestQueuedAt ? new Date(input.oldestQueuedAt) : null,
    highestAttemptCount: input.highestAttemptCount ?? 0,
    lastErrorCode: input.lastErrorCode?.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 100) || null,
    appVersion: input.appVersion?.slice(0, 50) || null,
    appVersionCode: input.appVersionCode ?? null,
    listenerConnected: input.listenerConnected ?? null,
    queueStorageVersion: input.queueStorageVersion ?? null,
  };
  await prisma.bridgeDeviceStatus.upsert({
    where: { deviceId: input.deviceId },
    create: {
      deviceId: input.deviceId,
      ...diagnostics,
      lastSeenAt: now,
    },
    update: {
      ...diagnostics,
      lastSeenAt: now,
    },
  });
}
