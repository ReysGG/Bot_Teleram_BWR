import { expect, it } from "vitest";
import sharp from "sharp";
import { publicCatalogImageResponse } from "@/server/products/public-image-response";

it("shrinks oversized catalog images and keeps repeated responses intact", async () => {
  const raw = Buffer.alloc(1700 * 550 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 13 + (i >> 12)) % 256;
  const png = await sharp(raw, { raw: { width: 1700, height: 550, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  const uri = `data:image/png;base64,${png.toString("base64")}`;
  const [first, second] = await Promise.all([publicCatalogImageResponse(uri), publicCatalogImageResponse(uri)]);
  const a = Buffer.from(await first.arrayBuffer()), b = Buffer.from(await second.arrayBuffer());
  expect(a.equals(b)).toBe(true);
  expect(a.length).toBeLessThan(png.length);
  expect(first.headers.get("content-type")).toBe("image/webp");
  expect((await sharp(a).metadata()).width).toBeLessThanOrEqual(1280);
  expect(Number(first.headers.get("content-length"))).toBe(a.length);
});
it("returns 404 for missing content without fetching arbitrary external URLs", async () => {
  expect((await publicCatalogImageResponse(null)).status).toBe(404);
  expect((await publicCatalogImageResponse("https://example.test/private" )).status).toBe(404);
});
