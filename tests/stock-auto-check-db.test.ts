import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { findAutoCheckCandidateIds } from "@/server/stock/health-check";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const productIds: string[] = [];

databaseDescribe("automatic stock health selection", () => {
  afterAll(async () => {
    await prisma.digitalStockItem.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.$disconnect();
  });

  it("selects unchecked and stale active/sold stock only", async () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    const product = await prisma.product.create({
      data: {
        slug: `auto-health-${randomUUID()}`,
        name: "Automatic health selection",
        description: "Temporary integration product",
        price: 8_000,
      },
    });
    productIds.push(product.id);

    const rows = await Promise.all(
      [
        { label: "unchecked", status: "AVAILABLE" as const, lastCheckedAt: null },
        {
          label: "sold-stale",
          status: "DELIVERED" as const,
          lastCheckedAt: new Date(now.getTime() - 10 * 60_000),
        },
        {
          label: "banned-fresh",
          status: "BANNED" as const,
          lastCheckedAt: new Date(now.getTime() - 10_000),
        },
        { label: "reserved", status: "RESERVED" as const, lastCheckedAt: null },
        { label: "disabled", status: "DISABLED" as const, lastCheckedAt: null },
      ].map((item) =>
        prisma.digitalStockItem.create({
          data: {
            productId: product.id,
            originalFilename: `${item.label}.json`,
            credentialFingerprint: `auto-health-${item.label}-${randomUUID()}`,
            encryptedPayload: "integration-encrypted",
            encryptionIv: "integration-iv",
            encryptionTag: "integration-tag",
            status: item.status,
            lastCheckedAt: item.lastCheckedAt,
          },
        }),
      ),
    );
    const archived = await prisma.digitalStockItem.create({
      data: {
        productId: product.id,
        originalFilename: "archived.json",
        credentialFingerprint: `auto-health-archived-${randomUUID()}`,
        encryptedPayload: "integration-encrypted",
        encryptionIv: "integration-iv",
        encryptionTag: "integration-tag",
        status: "AVAILABLE",
        archivedAt: now,
      },
    });

    const selected = await findAutoCheckCandidateIds({
      intervalSeconds: 30,
      limit: 9,
      now,
      productId: product.id,
    });

    expect(selected).toEqual(expect.arrayContaining([rows[0].id, rows[1].id]));
    expect(selected).not.toContain(rows[2].id);
    expect(selected).not.toContain(rows[3].id);
    expect(selected).not.toContain(rows[4].id);
    expect(selected).not.toContain(archived.id);
  });
});
