import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { importStockFiles } from "@/server/stock/inventory";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const productIds: string[] = [];

function accessToken(subject: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString(
    "base64url",
  );
  return `header.${payload}.integration-signature-${randomUUID()}`;
}

databaseDescribe("9router stock import", () => {
  afterAll(async () => {
    await prisma.digitalStockItem.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.$disconnect();
  });

  it("imports three users that share one ChatGPT account id", async () => {
    const product = await prisma.product.create({
      data: {
        slug: `shared-workspace-${randomUUID()}`,
        name: "Shared workspace import",
        description: "Temporary integration product",
        price: 8_000,
      },
    });
    productIds.push(product.id);
    const sharedChatgptAccountId = `shared-${randomUUID()}`;
    const files = ["first", "second", "third"].map((label) => ({
      filename: `${label}.9router.json`,
      content: Buffer.from(
        JSON.stringify({
          accessToken: accessToken(`${label}-${randomUUID()}`),
          email: `${label}-${randomUUID()}@example.com`,
          provider: "codex",
          providerSpecificData: { chatgptAccountId: sharedChatgptAccountId },
        }),
      ),
    }));

    const imported = await importStockFiles({ productId: product.id, files });

    expect(imported).toHaveLength(3);
    expect(
      await prisma.digitalStockItem.count({ where: { productId: product.id } }),
    ).toBe(3);
  });

  it("imports unique TXT lines and skips duplicates already stored", async () => {
    const product = await prisma.product.create({
      data: {
        slug: `line-stock-${randomUUID()}`,
        name: "Line stock import",
        description: "Temporary line inventory product",
        price: 5_000,
      },
    });
    productIds.push(product.id);
    const first = await importStockFiles({
      productId: product.id,
      files: [{
        filename: "codes.txt",
        content: Buffer.from("SYS-ONE\nSYS-TWO\nSYS-ONE\n", "utf8"),
      }],
    });
    const second = await importStockFiles({
      productId: product.id,
      files: [{
        filename: "more.txt",
        content: Buffer.from("SYS-TWO\nSYS-THREE\n", "utf8"),
      }],
    });

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(1);
    expect(
      await prisma.digitalStockItem.count({ where: { productId: product.id } }),
    ).toBe(3);
  });
});
