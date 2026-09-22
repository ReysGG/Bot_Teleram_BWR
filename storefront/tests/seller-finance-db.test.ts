import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { approveUsableWebOrder } from "@/server/seller/usability-approval";
import { acknowledgeOrderDelivery } from "@/server/telegram/delivery-feedback";
import { requestSellerWithdrawal } from "@/server/seller/finance";
import { transitionSellerWithdrawal } from "@/server/seller/admin-finance";

// Fail closed: these tests can only write to this disposable loopback database.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
const enabled = process.env.RUN_SELLER_DB_TESTS === "true" && url.hostname === "127.0.0.1" && url.port === "55439" && url.pathname === "/bwr_seller_test";

async function fixture() {
  const id = randomUUID();
  const seller = await prisma.sellerAccount.create({ data: { slug: id, displayName: "Synthetic seller", status: "ACTIVE" } });
  const customer = await prisma.webCustomer.create({ data: { contactLookupHash: id, contactMasked: "test@example.test", passwordHash: "not-a-login" } });
  const product = await prisma.product.create({ data: { sellerId: seller.id, slug: id, name: "Synthetic item", description: "Test only", price: 50000 } });
  const stock = await prisma.digitalStockItem.create({ data: { productId: product.id, originalFilename: "fixture.txt", credentialFingerprint: id, encryptedPayload: "fixture", encryptionIv: "fixture", encryptionTag: "fixture" } });
  const order = await prisma.order.create({ data: { idempotencyKey: id, invoiceNumber: id.toUpperCase(), chatId: `web:${customer.id}`, webCustomerId: customer.id, channel: "WEB", subtotal: 50000, serviceFee: 0, grandTotal: 50000, paymentStatus: "PAID", status: "COMPLETED", expiresAt: new Date(Date.now() + 600000), items: { create: { productId: product.id, productNameSnapshot: product.name, unitPrice: 50000, stockItemId: stock.id, sellerIdSnapshot: seller.id, sellerCommissionBpsSnapshot: 1000 } }, deliveryReceipts: { create: { dedupeKey: id, stockItemId: stock.id, chatId: `web:${customer.id}`, channel: "WEB", status: "SENT" } } } });
  const account = await prisma.sellerPayoutAccount.create({ data: { sellerId: seller.id, bank: "Test Bank", holder: "Synthetic seller", masked: "***0000", encryptedPayload: "fixture", encryptionIv: "fixture", encryptionTag: "fixture", status: "VERIFIED" } });
  return { seller, customer, order, account };
}

describe.skipIf(!enabled)("isolated seller money flow", () => {
  afterAll(async () => { await prisma.$disconnect(); });
  it("file acknowledgement leaves funds locked; concurrent usable approvals credit once", async () => {
    const f = await fixture();
    await acknowledgeOrderDelivery({ orderId: f.order.id, chatId: f.order.chatId });
    expect(await prisma.sellerWallet.findUnique({ where: { sellerId: f.seller.id } })).toBeNull();
    await Promise.all(Array.from({ length: 6 }, () => approveUsableWebOrder(f.customer.id, f.order.invoiceNumber)));
    expect((await prisma.sellerWallet.findUniqueOrThrow({ where: { sellerId: f.seller.id } })).available).toBe(45000n);
    expect(await prisma.sellerJournal.count({ where: { sellerId: f.seller.id } })).toBe(1);
  });
  it("rejects another buyer, unpaid, refunded and incompletely delivered orders", async () => {
    const f = await fixture();
    await expect(approveUsableWebOrder("other-buyer", f.order.invoiceNumber)).rejects.toThrow("order_not_found");
    await prisma.order.update({ where: { id: f.order.id }, data: { paymentStatus: "PENDING" } });
    await expect(approveUsableWebOrder(f.customer.id, f.order.invoiceNumber)).rejects.toThrow("order_not_eligible");
    await prisma.order.update({ where: { id: f.order.id }, data: { paymentStatus: "PAID", refundedAt: new Date() } });
    await expect(approveUsableWebOrder(f.customer.id, f.order.invoiceNumber)).rejects.toThrow("order_not_eligible");
    await prisma.order.update({ where: { id: f.order.id }, data: { refundedAt: null } });
    await prisma.sentDelivery.updateMany({ where: { orderId: f.order.id }, data: { status: "READY" } });
    await expect(approveUsableWebOrder(f.customer.id, f.order.invoiceNumber)).rejects.toThrow("delivery_incomplete");
    expect(await prisma.sellerJournal.count({ where: { sellerId: f.seller.id } })).toBe(0);
  });
  it("blocks approval while a delivery complaint needs review", async () => {
    const f = await fixture();
    await prisma.telegramNotification.create({ data: { dedupeKey: `delivery-missing-report:${f.order.id}`, chatId: f.order.chatId, orderId: f.order.id, kind: "DELIVERY_MISSING_REPORT", status: "MANUAL_REVIEW" } });
    await expect(approveUsableWebOrder(f.customer.id, f.order.invoiceNumber)).rejects.toThrow("delivery_under_review");
  });
  it("serializes simultaneous withdrawal requests and preserves held funds during review", async () => {
    const f = await fixture();
    await approveUsableWebOrder(f.customer.id, f.order.invoiceNumber);
    const requests = await Promise.allSettled(Array.from({ length: 3 }, () => requestSellerWithdrawal(f.seller.id, { amount: "40000", accountId: f.account.id, requestKey: randomUUID() })));
    expect(requests.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const w = await prisma.sellerWithdrawal.findFirstOrThrow({ where: { sellerId: f.seller.id } });
    for (const [action, version] of [["approve", 1], ["start", 2], ["review", 3]] as const) await transitionSellerWithdrawal({ id: w.id, action, version, actor: "test-admin", reason: "Checking transfer" });
    expect((await prisma.sellerWallet.findUniqueOrThrow({ where: { sellerId: f.seller.id } })).held).toBe(40000n);
    await expect(transitionSellerWithdrawal({ id: w.id, action: "paid", version: 3, actor: "test-admin", reference: randomUUID() })).rejects.toThrow("withdrawal_state_changed");
    await transitionSellerWithdrawal({ id: w.id, action: "fail", version: 4, actor: "test-admin", reason: "Bank confirmed no transfer" });
    const wallet = await prisma.sellerWallet.findUniqueOrThrow({ where: { sellerId: f.seller.id } });
    expect(wallet.available).toBe(45000n); expect(wallet.held).toBe(0n);
    expect(await prisma.sellerAudit.count({ where: { sellerId: f.seller.id } })).toBe(4);
    await expect(transitionSellerWithdrawal({ id: w.id, action: "paid", version: 5, actor: "test-admin", reference: randomUUID() })).rejects.toThrow("withdrawal_state_changed");
  });
});
