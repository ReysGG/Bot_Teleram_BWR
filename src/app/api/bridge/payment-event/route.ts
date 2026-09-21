import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { isRetryableTransactionError } from "@/server/db/transaction-retry";
import { requireEnv } from "@/server/env";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { confirmWalletTopup } from "@/server/wallet/topup";
import { existingBridgeEventDisposition } from "@/server/payment/bridge-event-state";
import { sha256, verifyTimestampedHmac } from "@/server/security/crypto";
import { consumeRateLimit, rateLimitSource } from "@/server/security/rate-limit";

export const runtime = "nodejs";

const payloadSchema = z.object({
  eventId: z.string().min(16).max(128),
  claimId: z.string().uuid(),
  ownerStoreId: z.string().min(1).max(100),
  externalOrderId: z.string().min(1).max(100),
  amount: z.number().int().positive(),
  postedAt: z.string().datetime(),
});

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 8 * 1024) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }
  const validSignature = verifyTimestampedHmac({
    secret: requireEnv("DANA_BRIDGE_CALLBACK_SECRET", 32),
    timestamp: request.headers.get("x-relay-timestamp"),
    signature: request.headers.get("x-relay-signature"),
    rawBody,
  });
  if (!validSignature) {
    const source = rateLimitSource(request.headers, "payment-relay");
    if (!consumeRateLimit(`bridge-callback-invalid:${source}`, 60, 60_000)) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (
    !consumeRateLimit(`bridge-callback:${payload.ownerStoreId}`, 240, 60_000)
  ) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const payloadHash = sha256(rawBody);
  try {
    await prisma.bridgePaymentEvent.create({
      data: {
        eventId: payload.eventId,
        claimId: payload.claimId,
        amount: payload.amount,
        postedAt: new Date(payload.postedAt),
        payloadHash,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.bridgePaymentEvent.findUnique({
        where: { eventId: payload.eventId },
        select: { status: true, payloadHash: true },
      });
      if (!existing) throw error;
      if (
        existingBridgeEventDisposition({
          status: existing.status,
          payloadHash: existing.payloadHash,
          expectedPayloadHash: payloadHash,
        }) === "duplicate"
      ) {
        return NextResponse.json({ ok: true, status: "duplicate" });
      }
    }
    throw error;
  }

  const claim = await prisma.bridgePaymentClaim.findUnique({
    where: { claimId: payload.claimId },
  });
  const externalReference = claim?.orderId ?? claim?.walletTopupId;
  const postedAt = new Date(payload.postedAt);
  const validMatch =
    claim &&
    payload.ownerStoreId === requireEnv("DANA_BRIDGE_STORE_ID") &&
    payload.externalOrderId === externalReference &&
    payload.amount === claim.amount &&
    postedAt >= new Date(claim.createdAt.getTime() - 5 * 60_000) &&
    postedAt <= new Date(claim.expiresAt.getTime() + 5 * 60_000);

  if (!validMatch || !claim) {
    await prisma.bridgePaymentEvent.update({
      where: { eventId: payload.eventId },
      data: {
        status: "REJECTED",
        orderId: claim?.orderId,
        walletTopupId: claim?.walletTopupId,
        reason: "Claim, amount, owner, or time window mismatch",
      },
    });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  try {
    if (claim.orderId) {
      await confirmOrderPayment({
        orderId: claim.orderId,
        verifiedBy: `relay:${payload.eventId}`,
        bridgeEventId: payload.eventId,
      });
    } else if (claim.walletTopupId) {
      await confirmWalletTopup({
        walletTopupId: claim.walletTopupId,
        verifiedBy: `relay:${payload.eventId}`,
        bridgeEventId: payload.eventId,
      });
    } else {
      throw new Error("Payment claim has no target");
    }
    return NextResponse.json({ ok: true, status: "confirmed" });
  } catch (error) {
    // Leave the event RECEIVED so the relay can retry after a short-lived
    // transaction/lock contention. Marking it rejected here would make a
    // legitimate payment permanently unprocessable on the next delivery.
    if (isRetryableTransactionError(error)) {
      return NextResponse.json(
        { ok: false, error: "temporarily_unavailable" },
        { status: 503 },
      );
    }
    await prisma.bridgePaymentEvent.update({
      where: { eventId: payload.eventId },
      data: {
        status: "REJECTED",
        orderId: claim.orderId,
        walletTopupId: claim.walletTopupId,
        reason: error instanceof Error ? error.message.slice(0, 500) : "Confirmation failed",
      },
    });
    return NextResponse.json({ ok: false }, { status: 409 });
  }
}
