import { describe, expect, it, vi } from "vitest";
import {
  maskWebCustomerEmail,
  normalizeWebCustomerEmail,
  normalizeWebCustomerPassword,
  webCustomerChatId,
  webCustomerContactLookupHash,
  WebCustomerAccessError,
} from "@/server/storefront/customer-access";

describe("storefront customer access primitives", () => {
  it("normalizes and masks email identifiers", () => {
    expect(normalizeWebCustomerEmail("  David.Reys@Example.COM ")).toBe(
      "david.reys@example.com",
    );
    expect(maskWebCustomerEmail("davidreysgg@gmail.com")).toBe("da***@gmail.com");
  });

  it("rejects weak or bcrypt-truncated passwords", () => {
    expect(() => normalizeWebCustomerPassword("short")).toThrow(WebCustomerAccessError);
    expect(() => normalizeWebCustomerPassword("x".repeat(73))).toThrow(WebCustomerAccessError);
    expect(normalizeWebCustomerPassword("aman-sekali-123")).toBe("aman-sekali-123");
  });

  it("uses a keyed lookup hash and stable synthetic web chat ID", () => {
    vi.stubEnv("STOREFRONT_CONTACT_LOOKUP_SECRET", "lookup-secret-that-is-at-least-32-characters");
    const first = webCustomerContactLookupHash("David@Example.com");
    const second = webCustomerContactLookupHash("david@example.com");
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(webCustomerChatId("customer-1")).toBe("web:customer-1");
    vi.unstubAllEnvs();
  });
});
