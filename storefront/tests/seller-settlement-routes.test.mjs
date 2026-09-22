import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("buyer usability approval is a dedicated action and is not hidden in the download UI", async () => {
  const approval = await read("src/components/orders/product-approval.tsx");
  const route = await read("src/app/api/orders/[invoice]/delivery-approval/route.ts");
  const settlement = await read("src/server/seller/usability-approval.ts");
  assert.match(approval, /Produk bisa digunakan/);
  assert.match(route, /approveUsableWebOrder/);
  assert.match(settlement, /releaseSellerEarningsAfterApproval/);
  assert.match(settlement, /delivery_incomplete/);
});

test("seller payout list is browse-only and detail owns transitions", async () => {
  const list = await read("src/app/admin/sellers/withdrawals/page.tsx");
  const detail = await read("src/app/admin/sellers/withdrawals/[id]/page.tsx");
  const action = await read("src/app/api/admin/sellers/withdrawals/[id]/action/route.ts");
  assert.doesNotMatch(list, /method="post"/);
  assert.match(list, /withdrawals\/\$\{withdrawal\.id\}/);
  assert.match(detail, /WithdrawalActions/);
  assert.match(action, /isPayoutAction/);
  assert.match(action, /version/);
});
