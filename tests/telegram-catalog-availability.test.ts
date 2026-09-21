import { describe, expect, it } from "vitest";
import {
  availabilityButtonStyle,
  groupCatalogOffer,
} from "@/server/telegram/flows/catalog/availability";

describe("Telegram grouped catalog offer", () => {
  it("advertises a price from the same availability tier as the group icon", () => {
    expect(
      groupCatalogOffer([
        { price: 3_000, availability: "OUT_OF_STOCK" },
        { price: 20_000, availability: "IN_STOCK" },
        { price: 25_000, availability: "IN_STOCK" },
      ]),
    ).toEqual({ availability: "IN_STOCK", price: 20_000 });
  });

  it("uses the lowest preorder price when no variant is immediately available", () => {
    expect(
      groupCatalogOffer([
        { price: 8_000, availability: "OUT_OF_STOCK" },
        { price: 12_000, availability: "PREORDER" },
        { price: 10_000, availability: "PREORDER" },
      ]),
    ).toEqual({ availability: "PREORDER", price: 10_000 });
  });

  it("returns null for an empty group", () => {
    expect(groupCatalogOffer([])).toBeNull();
  });

  it("maps availability to Telegram's native button colors", () => {
    expect(availabilityButtonStyle("IN_STOCK")).toBe("success");
    expect(availabilityButtonStyle("PREORDER")).toBe("primary");
    expect(availabilityButtonStyle("OUT_OF_STOCK")).toBe("danger");
    expect(availabilityButtonStyle("IN_STOCK", true)).toBe("danger");
  });
});
