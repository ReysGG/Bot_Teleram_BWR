import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  androidPaymentBridgeEnabled,
  androidPaymentBridgeSecret,
} from "@/server/payment/android-bridge-config";
import {
  processAndroidBridgeNotification,
  type AndroidBridgePayload,
} from "@/server/payment/android-bridge";
import { verifyTimestampedHmac } from "@/server/security/crypto";
import { consumeRateLimit, rateLimitSource } from "@/server/security/rate-limit";
import { ShopeeAndroidFallbackGraceError } from "@/server/payment/shopee-partner-fallback";

export const runtime = "nodejs";

const payloadSchema = z
  .object({
    eventId: z.string().min(16).max(128),
    deviceId: z.string().min(8).max(200),
    packageName: z.string().min(1).max(200),
    title: z.string().max(500),
    body: z.string().max(2_000),
    postedAt: z.string().datetime(),
  })
  .strict();

export async function POST(request: NextRequest) {
  if (!androidPaymentBridgeEnabled()) {
    return NextResponse.json({ ok: false, error: "bridge_disabled" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8 * 1024) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 8 * 1024) {
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
    if (!consumeRateLimit(`bridge-android-invalid:${source}`, 60, 60_000)) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let payload: AndroidBridgePayload;
  try {
    payload = payloadSchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (
    !consumeRateLimit(
      `bridge-android-notification:${payload.deviceId}`,
      240,
      60_000,
    )
  ) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  try {
    const result = await processAndroidBridgeNotification(payload, rawBody);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ShopeeAndroidFallbackGraceError) {
      return NextResponse.json(
        { ok: false, error: "shopee_web_session_primary_pending" },
        {
          status: 503,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
