import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { encryptSecret } from "@/server/security/crypto";
import { importAccountLoginFiles } from "@/server/redeem/account-login";
import {
  addRedeemUpload,
  newPendingRedeemBatch,
  parseRedeemJson,
  prepareRedeemOutput,
} from "@/server/redeem/service";
import { parseCredentialJson } from "@/server/stock/credential";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function accessToken(subject: string, suffix: string) {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString("base64url");
  return `header.${payload}.signature-${suffix}-${"x".repeat(24)}`;
}

databaseDescribe("K12 account redeem ownership", () => {
  const label = randomUUID();
  const chatId = `redeem-owner-${label}`;
  const email = `redeem-${label}@example.com`;
  const token = accessToken(`subject-${label}`, "original");
  let productId = "";
  let orderId = "";
  let stockItemId = "";

  beforeAll(async () => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 23).toString("base64");
    const product = await prisma.product.create({
      data: {
        slug: `redeem-${label}`,
        name: "Synthetic redeem product",
        description: "Integration-only product",
        price: 8_000,
      },
    });
    productId = product.id;
    const order = await prisma.order.create({
      data: {
        idempotencyKey: `redeem-order-${label}`,
        invoiceNumber: `REDEEM-${label}`,
        chatId,
        subtotal: 8_000,
        serviceFee: 0,
        grandTotal: 8_000,
        status: "COMPLETED",
        paymentStatus: "PAID",
        paidAt: new Date(),
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    orderId = order.id;
    const rawStock = JSON.stringify({ email, accessToken: token, provider: "codex" });
    const parsed = parseCredentialJson(rawStock);
    const encrypted = encryptSecret(rawStock);
    const stock = await prisma.digitalStockItem.create({
      data: {
        productId,
        originalFilename: `${email}.json`,
        credentialFingerprint: parsed.fingerprint,
        status: "DELIVERED",
        healthStatus: "HEALTHY",
        deliveredOrderId: orderId,
        deliveredAt: new Date(),
        ...encrypted,
      },
    });
    stockItemId = stock.id;
    await prisma.orderItem.create({
      data: {
        orderId,
        productId,
        productNameSnapshot: product.name,
        unitPrice: 8_000,
        stockItemId,
      },
    });
    await importAccountLoginFiles({
      importedBy: "integration@example.com",
      files: [{
        filename: "synthetic-login.txt",
        content: Buffer.from(
          `${email}----synthetic-password----9e5f94bc-e8a4-4e73-b8be-63364c29d753----${"m".repeat(40)}\n`,
        ),
      }],
    });
  });

  afterAll(async () => {
    await prisma.accountRedeemEvent.deleteMany({ where: { stockItemId } });
    await prisma.accountRedeemBatch.deleteMany({ where: { chatId } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.digitalStockItem.deleteMany({ where: { id: stockItemId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.accountLoginCredential.deleteMany({ where: { sourceFilename: "synthetic-login.txt" } });
    await prisma.$disconnect();
  });

  it("redeems an exact delivered credential owned by the uploader", async () => {
    const pending = newPendingRedeemBatch(10);
    const parsed = parseRedeemJson(Buffer.from(JSON.stringify({
      email,
      accessToken: token,
      provider: "codex",
    })));
    const added = await addRedeemUpload({ chatId, pending, parsed });
    const output = await prepareRedeemOutput({ chatId, pending: added.pending });

    expect(added.pending.stockItemIds).toEqual([stockItemId]);
    expect(output.units).toHaveLength(1);
    expect(output.content.toString("utf8")).toContain("synthetic-password");
  });

  it("rejects another chat and a forged token with the same unverified JWT subject", async () => {
    const forged = parseRedeemJson(Buffer.from(JSON.stringify({
      email,
      accessToken: accessToken(`subject-${label}`, "forged"),
      provider: "codex",
    })));
    const forgedResult = await addRedeemUpload({
      chatId,
      pending: newPendingRedeemBatch(11),
      parsed: forged,
    });
    const otherBuyer = await addRedeemUpload({
      chatId: `other-${chatId}`,
      pending: newPendingRedeemBatch(12),
      parsed: parseRedeemJson(Buffer.from(JSON.stringify({ email, accessToken: token, provider: "codex" }))),
    });

    expect(forgedResult.pending.stockItemIds).toHaveLength(0);
    expect(otherBuyer.pending.stockItemIds).toHaveLength(0);
  });
});
