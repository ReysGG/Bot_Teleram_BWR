import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { decodeStoredProductImage } from "@/server/products/media";

function publicImageHeaders(contentType: string, contentLength: number) {
  return {
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    "Content-Length": String(contentLength),
    "Content-Security-Policy": "default-src 'none'",
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  };
}

const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const cache = new Map<string, { content: Buffer; contentType: string }>();
let cacheBytes = 0;
let conversionTail: Promise<unknown> = Promise.resolve();
const pending = new Map<string, Promise<{ content: Buffer; contentType: string } | null>>();

async function optimizedImage(imageUrl: string) {
  const key = createHash("sha256").update(imageUrl).digest("hex");
  const cached = cache.get(key);
  if (cached) return cached;
  const active = pending.get(key);
  if (active) return active;
  // Serialize decoding/resizing to bound native memory on the small VPS.
  const work = conversionTail.then(async () => {
    const original = decodeStoredProductImage(imageUrl);
    if (!original) return null;
    let result = original;
    try {
      const pipeline = sharp(original.content, { limitInputPixels: 16_000_000 });
      const meta = await pipeline.metadata();
      // Preserve animated uploads and small images that already transfer quickly.
      if ((meta.pages ?? 1) === 1 && original.content.length > 32 * 1024) {
        const content = await pipeline.rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).webp({ quality: 78, effort: 3 }).toBuffer();
        if (content.length < original.content.length) {
          result = { content, contentType: "image/webp" };
          original.content.fill(0);
        }
      }
    } catch {
      // Keep previously accepted uploads available if the optimizer cannot read them.
    }
    while (cache.size >= 64 || cacheBytes + result.content.length > MAX_CACHE_BYTES) {
      const oldest = cache.keys().next().value;
      if (!oldest) break;
      cacheBytes -= cache.get(oldest)!.content.length;
      cache.delete(oldest);
    }
    cache.set(key, result); cacheBytes += result.content.length;
    return result;
  });
  conversionTail = work.catch(() => undefined);
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}

export async function publicCatalogImageResponse(
  imageUrl: string | null | undefined,
) {
  const stored = imageUrl ? await optimizedImage(imageUrl) : null;
  if (!stored) return new NextResponse(null, { status: 404 });

  return new NextResponse(Uint8Array.from(stored.content), {
      headers: publicImageHeaders(
        stored.contentType,
        stored.content.byteLength,
      ),
  });
}
