import assert from "node:assert/strict";
import test from "node:test";
import { shopFilterHref } from "../src/lib/shop-filters.ts";

test("changing availability preserves category, search and sorting", () => {
  const url = new URL(shopFilterHref({ q: "Claude API", category: "claude-api", sort: "price-low" }, { availability: "out" }), "https://store.example");
  assert.equal(url.searchParams.get("category"), "claude-api");
  assert.equal(url.searchParams.get("q"), "Claude API");
  assert.equal(url.searchParams.get("sort"), "price-low");
  assert.equal(url.searchParams.get("availability"), "out");
});

test("clearing one filter leaves the other filters active", () => {
  const url = new URL(shopFilterHref({ category: "chatgpt", availability: "ready", sort: "stock" }, { category: "" }), "https://store.example");
  assert.equal(url.searchParams.has("category"), false);
  assert.equal(url.searchParams.get("availability"), "ready");
  assert.equal(url.searchParams.get("sort"), "stock");
});

test("search containing query delimiters stays one value", () => {
  const url = new URL(shopFilterHref({ q: "AI & tools = #1" }, { category: "chatgpt" }), "https://store.example");
  assert.equal(url.searchParams.get("q"), "AI & tools = #1");
  assert.equal(url.hash, "");
  assert.equal(url.searchParams.size, 2);
});

test("empty filters and default sort resolve to the catalog root", () => {
  assert.equal(shopFilterHref({ q: " ", sort: "featured" }, {}), "/shop");
});
