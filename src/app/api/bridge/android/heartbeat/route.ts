import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  androidPaymentBridgeEnabled,
  androidPaymentBridgeSecret,
} from "@/server/payment/android-bridge-config";
import { recordAndroidBridgeHeartbeat } from "@/server/payment/android-bridge";
import { verifyTimestampedHmac } from "@/server/security/crypto";
import { consumeRateLimit, rateLimitSource } from "@/server/security/rate-limit";

export const runtime = "nodejs";

const payloadSchema = z
  .object({
    deviceId: z.string().min(8).max(200),
    queueSize: z.number().int().min(0).max(1_000_000),
    pendingQueueSize: z.number().int().min(0).max(1_000_000).optional(),
    blockedQueueSize: z.number().int().min(0).max(1_000_000).optional(),
    oldestQueuedAt: z.string().datetime().nullable().optional(),
    highestAttemptCount: z.number().int().min(0).max(1_000_000).optional(),
    lastErrorCode: z.string().max(100).nullable().optional(),
    appVersion: z.string().max(50).optional(),
    appVersionCode: z.number().int().min(1).max(1_000_000).optional(),
    listenerConnected: z.boolean().optional(),
    queueStorageVersion: z.number().int().min(1).max(1_000).optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  if (!androidPaymentBridgeEnabled()) {
    return NextResponse.json({ ok: false, error: "bridge_disabled" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2 * 1024) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 2 * 1024) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  const secret = androidPaymentBridgeSecret();
  if (!secret || secret.length < 32) {
    return NextResponse.json({ ok: false, error: "bridge_not_configured" }, { status: 503 });
  }
  const validSignature = verifyTimestampedHmac({
      secret,
      timestamp: request.headers.get("x-bridge-timestamp"),
      signature: request.headers.get("x-bridge-signature"),
      rawBody,
    });
  if (!validSignature) {
    const source = rateLimitSource(request.headers, "android-bridge");
    if (!consumeRateLimit(`bridge-heartbeat-invalid:${source}`, 60, 60_000)) {
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
    !consumeRateLimit(`bridge-android-heartbeat:${payload.deviceId}`, 120, 60_000)
  ) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  try {
    await recordAndroidBridgeHeartbeat(payload);
    return NextResponse.json({ ok: true, status: "alive" });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
