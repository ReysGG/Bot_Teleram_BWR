import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { encryptSecret } from "@/server/security/crypto";
import { CONTENT_SEARCH_BATCH_SIZE, searchInventoryContent } from "@/server/admin/inventory-content-search";

function row(id: string, text: string, binary = false) {
  return { id, originalFilename: `${id}.txt`, status: "DELIVERED", archivedAt: null as Date | null,
    deliveredAt: new Date("2026-01-01T00:00:00Z"), product: { name: "Test" },
    orderItem: { order: { id: "order-1", invoiceNumber: "TEST-1", status: "COMPLETED", chatId: "123",
      buyerEmail: "buyer@example.test", buyerUsername: "test_buyer", buyerDisplayName: "Test buyer" } },
    ...encryptSecret(binary ? `telegram-stock-file:v2;base64,${Buffer.from(text, "hex").toString("base64")}` : text) };
}
function client(rows: ReturnType<typeof row>[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  return { findMany, db: { digitalStockItem: { findMany } } as unknown as Pick<Prisma.TransactionClient, "digitalStockItem"> };
}
describe("admin encrypted stock content search", () => {
  beforeEach(() => { process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });
  it("finds partial text in legacy and v2 storage and returns associated buyer without content", async () => {
    const first = row("a", "private-secret CDK-Test-123 trailing-secret");
    const second = row("b", `telegram-stock-file:v2;base64,${Buffer.from('{"code":"CDK-Test-456"}').toString("base64")}`);
    second.archivedAt = new Date();
    const { db, findMany } = client([first, second, row("c", "no match")]);
    const result = await searchInventoryContent(db, { query: "cdk-test" });
    expect(result.matches.map(item => item.id)).toEqual(["a", "b"]);
    expect(result.matches[0].order?.buyerUsername).toBe("test_buyer");
    expect(result.matches[1].archived).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private-secret");
    expect(JSON.stringify(result)).not.toContain("encryptedPayload");
    expect(JSON.stringify(result)).not.toContain("CDK-Test");
    expect(findMany.mock.calls[0][0].where).toEqual({});
  });
  it("limits a batch and uses a keyset cursor with the product filter", async () => {
    const rows = Array.from({ length: CONTENT_SEARCH_BATCH_SIZE + 1 }, (_, i) => row(String(i).padStart(4, "0"), "CDK-example"));
    const { db, findMany } = client(rows);
    const result = await searchInventoryContent(db, { query: "CDK-", productId: "p1", after: "0000" });
    expect(result.scanned).toBe(CONTENT_SEARCH_BATCH_SIZE);
    expect(result.next).toBe("0099");
    expect(findMany.mock.calls[0][0].where).toEqual({ productId: "p1", id: { gt: "0000" } });
  });
  it("reports corrupt or nontext files separately instead of treating them as no match", async () => {
    const corrupt = row("a", "CDK-test"); corrupt.encryptionTag = Buffer.alloc(16).toString("base64");
    const { db } = client([corrupt, row("b", "fffeff", true), row("c", "CDK-test")]);
    const result = await searchInventoryContent(db, { query: "CDK-" });
    expect(result.unreadable).toBe(1); expect(result.nonText).toBe(1);
    expect(result.matches.map(item => item.id)).toEqual(["c"]); expect(result.next).toBeNull();
  });
  it("rejects very short queries before touching inventory", async () => {
    const { db, findMany } = client([]);
    await expect(searchInventoryContent(db, { query: "a" })).rejects.toThrow("INVALID_QUERY");
    expect(findMany).not.toHaveBeenCalled();
  });
});
