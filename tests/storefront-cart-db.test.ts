import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { mutateWebCart, readWebCart } from "@/server/storefront/cart";

const suite = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const owners: string[] = []; const products: string[] = [];
async function fixture() {
  const owner = await prisma.webCustomer.create({ data: { contactLookupHash: randomUUID(), contactMasked: "te***@example.com", passwordHash: "fixture-only" } }); owners.push(owner.id);
  const product = await prisma.product.create({ data: { slug: `cart-${randomUUID()}`, name: "Cart test product", description: "Disposable product", price: 10000 } }); products.push(product.id);
  return { owner: owner.id, product: product.id };
}
function add(productId: string, expectedRevision = 0, quantity = 1) { return { action: "add" as const, productId, expectedRevision, quantity, idempotencyKey: randomUUID() }; }

suite("Web cart PostgreSQL persistence and concurrency", () => {
  beforeAll(() => {
    const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.includes("cart_disposable")) throw new Error("Cart tests require their isolated disposable database");
  });
  afterAll(async () => {
    await prisma.webCustomer.deleteMany({ where: { id: { in: owners } } });
    await prisma.digitalStockItem.deleteMany({ where: { productId: { in: products } } });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    await prisma.$disconnect();
  });
  it("reading an empty cart does not create any record", async () => {
    const f = await fixture();
    expect(await readWebCart(f.owner)).toEqual({ revision: 0, items: [] });
    expect(await prisma.webCart.count({ where: { webCustomerId: f.owner } })).toBe(0);
  });
  it("deduplicates concurrent retries without adding quantity twice", async () => {
    const f = await fixture(); const command = add(f.product, 0, 2);
    await Promise.all([mutateWebCart(f.owner, command), mutateWebCart(f.owner, command)]);
    const cart = await readWebCart(f.owner);
    expect(cart.revision).toBe(1); expect(cart.items[0].quantity).toBe(2);
    expect(await prisma.webCartMutation.count({ where: { webCustomerId: f.owner } })).toBe(1);
  });
  it("rejects a retry key reused with another payload", async () => {
    const f = await fixture(); const command = add(f.product);
    await mutateWebCart(f.owner, command);
    await expect(mutateWebCart(f.owner, { ...command, quantity: 5 })).rejects.toMatchObject({ code: "cart_key_conflict" });
    expect((await readWebCart(f.owner)).items[0].quantity).toBe(1);
  });
  it("accepts only one of two edits from the same stale revision", async () => {
    const f = await fixture(); await mutateWebCart(f.owner, add(f.product));
    const results = await Promise.allSettled([mutateWebCart(f.owner, { ...add(f.product, 1, 2), action: "set" }), mutateWebCart(f.owner, { ...add(f.product, 1, 3), action: "set" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "cart_conflict" });
    expect((await readWebCart(f.owner)).revision).toBe(2);
  });
  it("separates owners and returns the latest state for an already applied retry", async () => {
    const a = await fixture(); const b = await fixture(); const original = add(a.product);
    await mutateWebCart(a.owner, original); await mutateWebCart(a.owner, add(a.product, 1, 2));
    await mutateWebCart(b.owner, add(a.product, 0, 5));
    expect((await mutateWebCart(a.owner, original)).items[0].quantity).toBe(3);
    expect((await readWebCart(b.owner)).items[0].quantity).toBe(5);
  });
  it("keeps prices live, blocks unpublished products and still permits removal", async () => {
    const f = await fixture(); await mutateWebCart(f.owner, add(f.product));
    await prisma.product.update({ where: { id: f.product }, data: { price: 12500 } });
    expect((await readWebCart(f.owner)).items[0].price).toBe(12500);
    await prisma.product.update({ where: { id: f.product }, data: { status: "INACTIVE" } });
    expect((await readWebCart(f.owner)).items[0]).toMatchObject({ canCheckout: false, name: "Produk tidak tersedia" });
    await expect(mutateWebCart(f.owner, add(f.product, 1))).rejects.toMatchObject({ code: "cart_product_unavailable" });
    expect((await mutateWebCart(f.owner, { action: "remove", productId: f.product, expectedRevision: 1, idempotencyKey: randomUUID() })).items).toEqual([]);
  });
  it("clears idempotently and never changes inventory, wallet, order or payment state", async () => {
    const f = await fixture();
    await prisma.digitalStockItem.create({ data: { productId: f.product, originalFilename: "fixture.txt", credentialFingerprint: randomUUID(), encryptedPayload: "fixture", encryptionIv: "fixture", encryptionTag: "fixture", status: "AVAILABLE", healthStatus: "HEALTHY" } });
    const cart = await mutateWebCart(f.owner, add(f.product)); expect(cart.items[0].canCheckout).toBe(true);
    const clear = { action: "clear" as const, expectedRevision: 1, idempotencyKey: randomUUID() };
    await mutateWebCart(f.owner, clear); expect((await mutateWebCart(f.owner, clear)).revision).toBe(2);
    expect((await readWebCart(f.owner)).items).toEqual([]);
    expect(await prisma.digitalStockItem.count({ where: { productId: f.product, status: "AVAILABLE" } })).toBe(1);
    expect(await prisma.order.count({ where: { webCustomerId: f.owner } })).toBe(0);
    expect(await prisma.wallet.count({ where: { chatId: `web:${f.owner}` } })).toBe(0);
  });
  it("rejects accumulated quantities over the limit without partially updating the cart", async () => {
    const f = await fixture(); await mutateWebCart(f.owner, add(f.product, 0, 750));
    await expect(mutateWebCart(f.owner, add(f.product, 1, 1))).rejects.toMatchObject({ code: "cart_quantity_invalid" });
    const cart = await readWebCart(f.owner);
    expect(cart.revision).toBe(1); expect(cart.items[0].quantity).toBe(750);
  });
  it("caps the number of distinct products and rejects a stale clear", async () => {
    const f = await fixture();
    const extra = Array.from({ length: 50 }, () => ({ id: randomUUID(), slug: `cart-limit-${randomUUID()}`, name: "Cart limit fixture", description: "Disposable", price: 1000 }));
    products.push(...extra.map(p => p.id));
    await prisma.product.createMany({ data: extra });
    await prisma.webCart.create({ data: { webCustomerId: f.owner, revision: 1 } });
    await prisma.webCartItem.createMany({ data: [f.product, ...extra.slice(0, 49).map(p => p.id)].map(productId => ({ webCustomerId: f.owner, productId, quantity: 1 })) });
    await expect(mutateWebCart(f.owner, add(extra[49].id, 1))).rejects.toMatchObject({ code: "cart_full" });
    await expect(mutateWebCart(f.owner, { action: "clear", expectedRevision: 0, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "cart_conflict" });
    expect((await readWebCart(f.owner)).items).toHaveLength(50);
  });
});
