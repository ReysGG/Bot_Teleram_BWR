import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ session: vi.fn(), customer: vi.fn(), touch: vi.fn(), clerk: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { webCustomerSession: { findUnique: f.session, updateMany: f.touch }, webCustomer: { findUniqueOrThrow: f.customer } } }));
vi.mock("@/server/storefront/clerk-identity", () => ({ requireClerkCustomer: f.clerk, ClerkCommerceError: class extends Error {} }));
import { createWebCustomerSession, requireWebCustomerSession } from "@/server/storefront/customer-access";

describe("Clerk and legacy commerce session isolation", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.unstubAllEnvs());
  it("rejects all legacy sessions after Clerk commerce is enabled", async () => {
    vi.stubEnv("STOREFRONT_CLERK_ENABLED", "true");
    await expect(requireWebCustomerSession("a".repeat(43))).rejects.toMatchObject({ code: "SESSION_INVALID" });
    expect(f.session).not.toHaveBeenCalled();
  });
  it("does not reuse any opaque legacy session when a Clerk token is supplied", async () => {
    f.clerk.mockResolvedValue({ id: "clerk-owner" });
    expect((await requireWebCustomerSession("clerk:token")).webCustomerId).toBe("clerk-owner");
    expect(f.session).not.toHaveBeenCalled();
  });
  it("rejects a previously valid legacy session after its owner links Clerk", async () => {
    f.session.mockResolvedValue({ expiresAt: new Date(Date.now() + 60000), revokedAt: null, webCustomer: { clerkUserId: "user_owner" } });
    await expect(requireWebCustomerSession("a".repeat(43))).rejects.toMatchObject({ code: "SESSION_INVALID" });
    expect(f.touch).not.toHaveBeenCalled();
  });
  it("refuses creating a password session after the account has been linked", async () => {
    f.customer.mockResolvedValue({ clerkUserId: "user_owner" });
    await expect(createWebCustomerSession({ customerId: "owner" })).rejects.toMatchObject({ code: "SESSION_INVALID" });
  });
  it("does not fall back to another account when Clerk verification fails", async () => {
    f.clerk.mockRejectedValue(new Error("verification failed"));
    await expect(requireWebCustomerSession("clerk:invalid")).rejects.toThrow();
    expect(f.session).not.toHaveBeenCalled();
  });
});
