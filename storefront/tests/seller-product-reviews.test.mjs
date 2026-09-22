import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("seller review queue is browse-only and links to dedicated detail routes", async () => {
  const queue = await read("src/app/admin/seller-products/reviews/page.tsx");
  assert.match(queue, /seller-review-search/);
  assert.match(queue, /pageCount/);
  assert.match(queue, /seller-products\/reviews\/\$\{draft\.id\}/);
  assert.doesNotMatch(queue, /method=\"post\"/);
});

test("seller review detail owns the decision form", async () => {
  const detail = await read("src/app/admin/seller-products/reviews/[id]/page.tsx");
  assert.match(detail, /SellerReviewForm/);
  assert.match(detail, /draft\.status === \"SUBMITTED\"/);
});

test("review POST redirects to the reviewed draft with stable domain error codes", async () => {
  const route = await read("src/app/api/admin/seller-products/[id]/review/route.ts");
  assert.match(route, /reviews\/\$\{encodeURIComponent\(id\)\}\?notice=reviewed/);
  assert.match(route, /draft_changed/);
  assert.match(route, /review_reason_required/);
  assert.match(route, /assertAdminOrigin\(request\)/);
  assert.match(route, /requireAdminRequest\(request\)/);
});
