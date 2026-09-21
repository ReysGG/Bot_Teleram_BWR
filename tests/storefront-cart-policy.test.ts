import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { webCartCommandSchema } from "@/server/storefront/cart-policy";

const base = { action: "add", productId: "product1", quantity: 2, expectedRevision: 0, idempotencyKey: randomUUID() };
describe("database cart command boundary", () => {
  it("accepts only a bounded command with a revision and retry key", () => {
    expect(webCartCommandSchema.parse(base)).toEqual(base);
  });
  it.each([{ quantity: 0 }, { quantity: 751 }, { quantity: 1.5 }, { quantity: "2" }, { expectedRevision: -1 }, { expectedRevision: undefined }, { idempotencyKey: "" }, { action: "checkout" }, { price: 0 }, { webCustomerId: "victim" }, { clerkUserId: "victim" }, { items: [] }])("rejects malformed or untrusted fields %j", extra => {
    expect(webCartCommandSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });
  it("requires remove and clear to carry their own version and retry key", () => {
    const common = { expectedRevision: 3, idempotencyKey: randomUUID() };
    expect(webCartCommandSchema.safeParse({ ...common, action: "remove", productId: "product1" }).success).toBe(true);
    expect(webCartCommandSchema.safeParse({ ...common, action: "clear" }).success).toBe(true);
  });
});
