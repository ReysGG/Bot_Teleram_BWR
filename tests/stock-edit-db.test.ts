import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import {
  decryptStockFile,
  decryptStockItem,
  importStockFiles,
  updateStockItem,
} from "@/server/stock/inventory";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const productIds: string[] = [];

function credential(identity: string) {
  return JSON.stringify({
    accessToken: `access-${identity}-${"x".repeat(30)}`,
    provider: "chatgpt",
    providerSpecificData: { accountId: identity },
  });
}

databaseDescribe("stock edit PostgreSQL safety", () => {
  beforeEach(() => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
  });

  afterAll(async () => {
    if (productIds.length > 0) {
      await prisma.digitalStockItem.deleteMany({
        where: { productId: { in: productIds } },
      });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    await prisma.$disconnect();
  });

  it(
    "re-encrypts editable stock while blocking duplicate and reserved changes",
    async () => {
      const sourceProduct = await prisma.product.create({
        data: {
          slug: `stock-edit-source-${randomUUID()}`,
          name: "Stock edit source",
          description: "Temporary integration product",
          price: 10_000,
        },
      });
      const targetProduct = await prisma.product.create({
        data: {
          slug: `stock-edit-target-${randomUUID()}`,
          name: "Stock edit target",
          description: "Temporary integration product",
          price: 12_000,
        },
      });
      productIds.push(sourceProduct.id, targetProduct.id);

      const [first] = await importStockFiles({
        productId: sourceProduct.id,
        files: [
          { filename: "first.json", content: Buffer.from(credential("first")) },
        ],
      });
      const [second] = await importStockFiles({
        productId: sourceProduct.id,
        files: [
          { filename: "second.json", content: Buffer.from(credential("second")) },
        ],
      });

      const replacement = credential("replacement");
      await prisma.digitalStockItem.update({
        where: { id: first.id },
        data: {
          healthStatus: "HEALTHY",
          healthHttpStatus: 200,
          quotaSnapshot: {
            version: 1,
            plan: "team",
            checkedAt: new Date().toISOString(),
            quotas: [],
          },
          lastCheckedAt: new Date(),
        },
      });
      await updateStockItem({
        stockItemId: first.id,
        productId: targetProduct.id,
        filename: "replacement credential.json",
        content: Buffer.from(replacement),
      });

      const updated = await prisma.digitalStockItem.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(updated).toMatchObject({
        productId: targetProduct.id,
        originalFilename: "replacement_credential.json",
        status: "AVAILABLE",
        healthStatus: "UNKNOWN",
        healthHttpStatus: null,
        quotaSnapshot: null,
        lastCheckedAt: null,
      });
      expect(decryptStockItem(updated)).toBe(replacement);
      expect(updated.encryptedPayload).not.toContain("replacement");

      await expect(
        updateStockItem({
          stockItemId: second.id,
          productId: sourceProduct.id,
          filename: "duplicate.json",
          content: Buffer.from(replacement),
        }),
      ).rejects.toMatchObject({ code: "stock-duplicate" });

      await prisma.digitalStockItem.update({
        where: { id: second.id },
        data: {
          status: "RESERVED",
          reservedOrderId: "integration-reservation",
        },
      });
      await expect(
        updateStockItem({
          stockItemId: second.id,
          productId: sourceProduct.id,
          filename: "reserved.json",
          content: Buffer.from(credential("reserved-change")),
        }),
      ).rejects.toMatchObject({
        code: "stock-not-editable",
      });

      const binaryContent = Buffer.from([0, 255, 17, 34, 51, 68]);
      const [binary] = await importStockFiles({
        productId: targetProduct.id,
        files: [{ filename: "license.bin", content: binaryContent }],
      });
      const binaryStock = await prisma.digitalStockItem.findUniqueOrThrow({
        where: { id: binary.id },
      });
      expect(binaryStock).toMatchObject({
        originalFilename: "license.bin",
        healthStatus: "HEALTHY",
      });
      expect(decryptStockFile(binaryStock)).toEqual(binaryContent);

      await updateStockItem({
        stockItemId: binary.id,
        productId: targetProduct.id,
        filename: "renamed-license.bin",
      });
      const renamedBinary = await prisma.digitalStockItem.findUniqueOrThrow({
        where: { id: binary.id },
      });
      expect(renamedBinary.originalFilename).toBe("renamed-license.bin");
      expect(decryptStockFile(renamedBinary)).toEqual(binaryContent);
    },
    30_000,
  );
});
