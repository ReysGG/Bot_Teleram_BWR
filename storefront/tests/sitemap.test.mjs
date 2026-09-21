import { test } from "node:test";
import assert from "node:assert/strict";
import { sitemapUrls, renderSitemap } from "../src/lib/sitemap-urls.ts";

test("sitemap contains only public catalog routes and removes duplicates", () => {
  const urls = sitemapUrls({ source: "api", products: [{ slug: "sample" }, { slug: "sample" }], groups: [{ slug: "ai" }] }, "https://store.example.test/");
  assert.equal(urls.length, 5);
  assert.ok(urls.includes("https://store.example.test/products/sample"));
  assert.ok(urls.includes("https://store.example.test/categories/ai"));
  assert.ok(urls.every(url => !/\/(account|orders|cart|checkout|api)(\/|$)/.test(new URL(url).pathname)));
});
test("unavailable or preview catalog cannot publish a misleading sitemap", () => {
  for (const source of ["preview", "disconnected"]) assert.throws(() => sitemapUrls({ source, products: [], groups: [] }, "https://store.example.test"));
});
test("slugs cannot introduce an external origin or query parameters", () => {
  const urls = sitemapUrls({ source: "api", products: [{ slug: "//evil.test?q=1&x=2" }], groups: [] }, "https://store.example.test");
  assert.ok(urls.every(url => new URL(url).origin === "https://store.example.test"));
  assert.equal(new URL(urls.at(-1)).search, "");
});
test("XML escapes locations and does not invent modification timestamps", () => {
  const xml = renderSitemap(["https://store.example.test/?a=1&b=2"]);
  assert.ok(xml.includes("&amp;"));
  assert.ok(xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  assert.ok(!xml.includes("lastmod"));
});
