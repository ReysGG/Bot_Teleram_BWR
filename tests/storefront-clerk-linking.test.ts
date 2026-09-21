import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ verify: vi.fn(), getUser: vi.fn(), hash: vi.fn(), compare: vi.fn(), find: vi.fn(), current: vi.fn(), create: vi.fn(), update: vi.fn(), revoke: vi.fn(), transaction: vi.fn(), lock: vi.fn() }));
vi.mock("@clerk/backend", () => ({ verifyToken: f.verify, createClerkClient: () => ({ users: { getUser: f.getUser } }) }));
vi.mock("bcryptjs", () => ({ default: { hash: f.hash, compare: f.compare } }));
vi.mock("@/server/db/prisma", () => ({ prisma: {
  webCustomer: { findUnique: f.find, findUniqueOrThrow: f.current, create: f.create, update: f.update },
  webCustomerSession: { updateMany: f.revoke }, $transaction: f.transaction, $executeRaw: f.lock,
} }));
import { connectClerkCustomer, requireClerkCustomer } from "@/server/storefront/clerk-identity";

const customer = { id: "customer-old", contactLookupHash: "lookup", contactMasked: "bu***@example.com", passwordHash: "old-hash", failedAttempts: 0, lockedUntil: null, clerkUserId: null };
describe("Clerk account linking policy with mocked storage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    for (const [key, value] of Object.entries({ STOREFRONT_CLERK_ENABLED: "true", STOREFRONT_CLERK_ISSUER: "https://test.example", STOREFRONT_CLERK_JWT_KEY: "test-public-key", STOREFRONT_CLERK_AUTHORIZED_PARTIES: "http://localhost:3001", STOREFRONT_CLERK_SECRET_KEY: "test-key", STOREFRONT_CONTACT_LOOKUP_SECRET: "local-test-lookup-secret-at-least-32-characters" })) vi.stubEnv(key, value);
    const now = Math.floor(Date.now() / 1000);
    f.verify.mockResolvedValue({ iss: "https://test.example", sub: "user_owner", sid: "sess_owner", azp: "http://localhost:3001", iat: now, exp: now + 60 });
    f.getUser.mockResolvedValue({ id: "user_owner", primaryEmailAddressId: "mail", emailAddresses: [{ id: "mail", emailAddress: "buyer@example.com", verification: { status: "verified" } }] });
    f.hash.mockResolvedValue("random-inaccessible-hash");
    f.find.mockImplementation(async ({ where }) => where.contactLookupHash ? customer : null);
    f.current.mockResolvedValue(customer);
    f.transaction.mockImplementation(async action => action({ webCustomer: { findUnique: f.find, findUniqueOrThrow: f.current, create: f.create, update: f.update }, webCustomerSession: { updateMany: f.revoke }, $executeRaw: f.lock }));
    f.update.mockImplementation(async ({ data }) => ({ ...customer, ...data }));
  });
  afterEach(() => vi.unstubAllEnvs());
  it("requires the old checkout password even when Clerk email is verified", async () => {
    await expect(connectClerkCustomer("clerk:test")).rejects.toMatchObject({ code: "account_link_required" });
    expect(f.update).not.toHaveBeenCalled(); expect(f.revoke).not.toHaveBeenCalled();
  });
  it("links only after password proof, disables the old password and revokes old sessions", async () => {
    f.compare.mockResolvedValue(true);
    const linked = await connectClerkCustomer("clerk:test", "old-password-123");
    expect(linked.id).toBe(customer.id);
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clerkUserId: "user_owner", clerkIssuer: "https://test.example", passwordHash: "random-inaccessible-hash" }) }));
    expect(f.revoke).toHaveBeenCalledWith(expect.objectContaining({ where: { webCustomerId: customer.id, revokedAt: null } }));
  });
  it("commits failed attempts and locks on the fifth failure instead of rolling back the counter", async () => {
    f.current.mockResolvedValue({ ...customer, failedAttempts: 4 }); f.compare.mockResolvedValue(false);
    await expect(connectClerkCustomer("clerk:test", "wrong-password-123")).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ data: { failedAttempts: 5, lockedUntil: expect.any(Date) } }));
    expect(f.revoke).not.toHaveBeenCalled();
  });
  it("cannot rebind a customer already owned by another Clerk identity", async () => {
    f.current.mockResolvedValue({ ...customer, clerkUserId: "user_other" }); f.compare.mockResolvedValue(true);
    await expect(connectClerkCustomer("clerk:test", "old-password-123")).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(f.update).not.toHaveBeenCalled();
  });
  it("keeps the existing binding after an email change and does not auto-merge another email account", async () => {
    f.find.mockResolvedValue({ ...customer, clerkUserId: "user_owner" });
    await expect(connectClerkCustomer("clerk:test")).resolves.toMatchObject({ id: customer.id });
    expect(f.getUser).not.toHaveBeenCalled(); expect(f.transaction).not.toHaveBeenCalled();
  });
  it("requires a verified primary email for a new account", async () => {
    f.getUser.mockResolvedValue({ id: "user_owner", primaryEmailAddressId: "mail", emailAddresses: [{ id: "mail", emailAddress: "buyer@example.com", verification: { status: "unverified" } }] });
    await expect(connectClerkCustomer("clerk:test")).rejects.toMatchObject({ code: "email_verification_required" });
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("creates a Clerk-owned account with an inaccessible legacy password", async () => {
    f.find.mockResolvedValue(null); f.create.mockResolvedValue({ ...customer, clerkUserId: "user_owner" });
    await connectClerkCustomer("clerk:test");
    expect(f.create).toHaveBeenCalledWith({ data: expect.objectContaining({ clerkUserId: "user_owner", passwordHash: "random-inaccessible-hash" }) });
  });
  it("rechecks the binding inside its transaction to make retries idempotent", async () => {
    f.find.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...customer, clerkUserId: "user_owner" });
    await connectClerkCustomer("clerk:test"); expect(f.create).not.toHaveBeenCalled(); expect(f.update).not.toHaveBeenCalled();
  });
  it("an unlinked token cannot read orders or wallet by an email match", async () => {
    await expect(requireClerkCustomer("clerk:test")).rejects.toMatchObject({ code: "account_setup_required" });
    expect(f.find).toHaveBeenCalledWith({ where: { clerkIssuer_clerkUserId: { clerkIssuer: "https://test.example", clerkUserId: "user_owner" } } });
  });
});
