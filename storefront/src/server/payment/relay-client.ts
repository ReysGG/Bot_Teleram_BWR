import { prisma } from "@/server/db/prisma";
import { appUrl, booleanEnv, optionalEnv, requireEnv } from "@/server/env";
import { hmacHex } from "@/server/security/crypto";
import { cleanError } from "@/server/utils/format";
import { qrisProviderUsesDanaRelay } from "@/server/payment/qris-provider-registry";

async function registerPaymentClaimById(claimRecordId: string): Promise<void> {
  const relayUrl = optionalEnv("DANA_BRIDGE_RELAY_URL");
  const claim = await prisma.bridgePaymentClaim.findUniqueOrThrow({
    where: { id: claimRecordId },
  });
  const externalReference = claim.orderId ?? claim.walletTopupId;
  if (!externalReference) throw new Error("Payment claim has no target");

  if (!relayUrl) {
    if (!booleanEnv("ALLOW_MANUAL_PAYMENT_WITHOUT_RELAY", true)) {
      await prisma.bridgePaymentClaim.update({
        where: { id: claim.id },
        data: { status: "FAILED", lastError: "DANA bridge relay is not configured" },
      });
      throw new Error("Payment relay is not configured");
    }
    await prisma.bridgePaymentClaim.update({
      where: { id: claim.id },
      data: { status: "LOCAL_ONLY", lastError: null },
    });
    return;
  }

  const body = JSON.stringify({
    claimId: claim.claimId,
    ownerStoreId: requireEnv("DANA_BRIDGE_STORE_ID"),
    externalOrderId: externalReference,
    amount: claim.amount,
    createdAt: claim.createdAt.toISOString(),
    expiresAt: claim.expiresAt.toISOString(),
    callbackUrl: new URL("/api/bridge/payment-event", appUrl()).toString(),
  });
  const timestamp = Date.now().toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(new URL("/v1/payment-claims", relayUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Relay-Key-Id": requireEnv("DANA_BRIDGE_RELAY_KEY_ID"),
        "X-Relay-Timestamp": timestamp,
        "X-Relay-Signature": hmacHex(
          requireEnv("DANA_BRIDGE_RELAY_SECRET", 32),
          `${timestamp}.${body}`,
        ),
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Relay rejected payment claim with HTTP ${response.status}`);
    }
    await prisma.bridgePaymentClaim.update({
      where: { id: claim.id },
      data: { status: "REGISTERED", registeredAt: new Date(), lastError: null },
    });
  } catch (error) {
    await prisma.bridgePaymentClaim.update({
      where: { id: claim.id },
      data: { status: "FAILED", lastError: cleanError(error) },
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function registerPaymentClaim(orderId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      qrisInvoiceAttempt: { select: { providerKeySnapshot: true } },
      bridgeClaim: { select: { id: true } },
    },
  });
  if (
    !order.bridgeClaim ||
    (order.qrisInvoiceAttempt &&
      !qrisProviderUsesDanaRelay(order.qrisInvoiceAttempt.providerKeySnapshot))
  ) {
    throw new Error("Only relay-backed QRIS orders can register payment claims");
  }
  return registerPaymentClaimById(order.bridgeClaim.id);
}

export async function registerWalletTopupClaim(
  walletTopupId: string,
): Promise<void> {
  const topup = await prisma.walletTopup.findUniqueOrThrow({
    where: { id: walletTopupId },
    select: {
      paymentMethod: true,
      qrisInvoiceAttempt: { select: { providerKeySnapshot: true } },
      bridgeClaim: { select: { id: true } },
    },
  });
  if (
    topup.paymentMethod !== "DANA_RELAY" ||
    !topup.bridgeClaim ||
    (topup.qrisInvoiceAttempt &&
      !qrisProviderUsesDanaRelay(topup.qrisInvoiceAttempt.providerKeySnapshot))
  ) {
    throw new Error("Only DANA wallet top ups can register relay claims");
  }
  return registerPaymentClaimById(topup.bridgeClaim.id);
}
