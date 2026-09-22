import { describe, expect, it } from "vitest";
import { ratingEligibility, ratingInput } from "../src/server/ratings/policy";
const eligible = { customerId: "buyer", ownerId: "buyer", orderStatus: "COMPLETED", paymentStatus: "PAID", refunded: false, hasRefund: false, channel: "WEB", receiptStatus: "SENT", downloadCount: 1 };
describe("verified purchase ratings", () => {
  it("accepts completed and downloaded purchases", () => expect(ratingEligibility(eligible)).toBeNull());
  it("does not disclose another buyer's order", () => expect(ratingEligibility({ ...eligible, ownerId: "other" })).toBe("rating_order_missing"));
  it.each([{ refunded: true }, { hasRefund: true }, { paymentStatus: "PENDING" }, { orderStatus: "FULFILLING" }])("rejects unsettled/refunded purchases %j", change => expect(ratingEligibility({ ...eligible, ...change })).toBe("rating_order_ineligible"));
  it.each([{ receiptStatus: "UNKNOWN" }, { receiptStatus: "READY" }, { downloadCount: 0 }])("requires delivery evidence %j", change => expect(ratingEligibility({ ...eligible, ...change })).toBe("rating_delivery_pending"));
  it.each([0, 6, 2.5, "5"])("rejects invalid stars %s", stars => expect(ratingInput.safeParse({ kind: "product", orderItemId: "item", stars }).success).toBe(false));
  it("rejects caller-supplied ownership", () => expect(ratingInput.safeParse({ kind: "seller", orderItemId: "item", stars: 5, sellerId: "victim" }).success).toBe(false));
});
