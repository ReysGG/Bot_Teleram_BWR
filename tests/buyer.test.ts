import { describe, expect, it } from "vitest";
import { buyerLabel, normalizeBuyerIdentity } from "@/server/orders/buyer";

describe("Telegram buyer identity", () => {
  it("labels Web buyers by email and never as Telegram chat recipients", () => {
    const buyer = { channel: "WEB", buyerUsername: null, buyerDisplayName: null, buyerEmail: "buyer@example.com", chatId: "web:customer" };
    expect(buyerLabel(buyer)).toBe("buyer@example.com");
    expect(buyerLabel({ ...buyer, buyerEmail: null })).toBe("Pelanggan Web");
  });
  it("stores username without @ and combines the display name", () => {
    expect(
      normalizeBuyerIdentity({
        username: "@jsonbuyer",
        firstName: "JSON",
        lastName: "Buyer",
      }),
    ).toEqual({
      buyerUsername: "jsonbuyer",
      buyerDisplayName: "JSON Buyer",
    });
  });

  it("prefers username while preserving legacy email and chat fallbacks", () => {
    expect(
      buyerLabel({
        buyerUsername: "jsonbuyer",
        buyerDisplayName: "JSON Buyer",
        buyerEmail: null,
        chatId: "123",
      }),
    ).toBe("@jsonbuyer");
    expect(
      buyerLabel({
        buyerUsername: null,
        buyerDisplayName: null,
        buyerEmail: "legacy@example.com",
        chatId: "123",
      }),
    ).toBe("legacy@example.com");
    expect(
      buyerLabel({
        buyerUsername: null,
        buyerDisplayName: null,
        buyerEmail: null,
        chatId: "123",
      }),
    ).toBe("Telegram 123");
  });
});
