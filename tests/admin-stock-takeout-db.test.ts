import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { encryptSecret } from "@/server/security/crypto";
import { accountEmailHash } from "@/server/redeem/account-login";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { downloadAdminStock } from "@/server/stock/admin-takeout";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const run = randomUUID();
const productIds: string[] = [];
const loginIds: string[] = [];
async function fixture() {
  const email = `${randomUUID()}@example.test`;
  const product = await prisma.product.create({ data: { slug: `takeout-${randomUUID()}`, name: "Synthetic takeout test", description: "Disposable fixture", price: 1000 } });
  productIds.push(product.id);
  const stock = await prisma.digitalStockItem.create({ data: {
    productId: product.id, originalFilename: "synthetic.json", credentialFingerprint: randomUUID(),
    status: "BANNED", healthStatus: "BANNED", healthHttpStatus: 401,
    ...encryptSecret(JSON.stringify({ accessToken: "synthetic-access-token-for-tests", email })),
  } });
  const login = await prisma.accountLoginCredential.create({ data: {
    emailHash: accountEmailHash(email), emailMasked: "test@example.test", tokenHash: randomUUID(), contentFingerprint: randomUUID(),
    sourceFilename: "synthetic.txt", importedBy: `test-${run}`,
    ...encryptSecret(JSON.stringify({ email, password: "synthetic-password", clientId: "synthetic-client", token: "synthetic-token" })),
  } });
  loginIds.push(login.id);
  return stock;
}
databaseDescribe("admin stock takeout with disposable PostgreSQL", () => {
  afterAll(async () => {
    await prisma.digitalStockItem.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.accountLoginCredential.deleteMany({ where: { id: { in: loginIds } } });
    await prisma.$disconnect();
  });
  it("archives only the selected stock and permits recovery download", async () => {
    const stock = await fixture();
    const result = await downloadAdminStock(stock.id, "bundle", true);
    expect(result.file.subarray(0, 2).toString()).toBe("PK"); result.file.fill(0);
    const archived = await prisma.digitalStockItem.findUniqueOrThrow({ where: { id: stock.id } });
    expect(archived.status).toBe("DISABLED"); expect(archived.archivedAt).not.toBeNull();
    const retry = await downloadAdminStock(stock.id, "email", true);
    expect(retry.file.toString()).toContain("----synthetic-password----"); retry.file.fill(0);
  });
  it("does not take stock reserved by a competing allocation transaction", async () => {
    const stock = await fixture();
    let signal!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((done) => { signal = done; });
    const ready = new Promise<void>((done) => { release = done; });
    const reservation = prisma.$transaction(async (tx) => {
      await lockInventoryAllocation(tx, stock.productId);
      signal(); await ready;
      await tx.digitalStockItem.update({ where: { id: stock.id }, data: { status: "RESERVED" } });
    });
    await locked;
    const takeout = downloadAdminStock(stock.id, "bundle", true);
    const rejected = expect(takeout).rejects.toThrow("stock-ineligible");
    release(); await reservation; await rejected;
    const current = await prisma.digitalStockItem.findUniqueOrThrow({ where: { id: stock.id } });
    expect(current.status).toBe("RESERVED"); expect(current.archivedAt).toBeNull();
  });
});
