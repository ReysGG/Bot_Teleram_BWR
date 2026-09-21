// Opt-in ONLY. This suite is not run while the owner prohibits database operations.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ verify: vi.fn(), getUser: vi.fn() }));
vi.mock("@clerk/backend", () => ({ verifyToken: f.verify, createClerkClient: () => ({ users: { getUser: f.getUser } }) }));
import { prisma } from "@/server/db/prisma";
import { connectClerkCustomer } from "@/server/storefront/clerk-identity";
import { getOrCreateWebCustomer, createWebCustomerSession, webCustomerChatId } from "@/server/storefront/customer-access";

const suite = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const ids: string[] = [];
suite("Clerk binding transactions on explicitly disposable PostgreSQL", () => {
  beforeAll(() => {
    const databaseName = new URL(process.env.DATABASE_URL ?? "http://invalid").pathname;
    if (!/webtest|disposable|_test/.test(databaseName)) throw new Error("Clerk DB tests require an explicitly disposable database");
    vi.stubEnv("STOREFRONT_CLERK_ISSUER", "https://test.example");
    vi.stubEnv("STOREFRONT_CLERK_JWT_KEY", "mock-key");
    vi.stubEnv("STOREFRONT_CLERK_AUTHORIZED_PARTIES", "http://localhost:3001");
    vi.stubEnv("STOREFRONT_CLERK_SECRET_KEY", "mock-key");
    vi.stubEnv("STOREFRONT_CONTACT_LOOKUP_SECRET", "disposable-clerk-test-contact-lookup-secret");
  });
  afterEach(() => { vi.stubEnv("STOREFRONT_CLERK_ENABLED", "false"); });
  afterAll(async () => {
    await prisma.webCustomerSession.deleteMany({ where: { webCustomerId: { in: ids } } });
    await prisma.wallet.deleteMany({ where: { chatId: { in: ids.map(webCustomerChatId) } } });
    await prisma.webCustomer.deleteMany({ where: { id: { in: ids } } });
    vi.unstubAllEnvs(); await prisma.$disconnect();
  });
  function mockIdentity(email: string) {
    f.verify.mockImplementation(async token => ({ iss: "https://test.example", sub: token, sid: "sess_test", azp: "http://localhost:3001", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 }));
    f.getUser.mockImplementation(async userId => ({ id: userId, primaryEmailAddressId: "email", emailAddresses: [{ id: "email", emailAddress: email, verification: { status: "verified" } }] }));
    vi.stubEnv("STOREFRONT_CLERK_ENABLED", "true");
  }
  it("concurrent retries create exactly one customer binding", async () => {
    const key = randomUUID().replaceAll("-", ""); mockIdentity(`${key}@example.com`);
    const owners = await Promise.all(Array.from({ length: 4 }, () => connectClerkCustomer(`clerk:user_${key}`)));
    ids.push(owners[0].id);
    expect(new Set(owners.map(owner => owner.id)).size).toBe(1);
    expect(await prisma.webCustomer.count({ where: { clerkUserId: `user_${key}` } })).toBe(1);
  });
  it("linking preserves the exact wallet owner and balance and revokes the old session", async () => {
    vi.stubEnv("STOREFRONT_CLERK_ENABLED", "false");
    const key = randomUUID().replaceAll("-", ""); const email = `${key}@example.com`;
    const { customer } = await getOrCreateWebCustomer({ email, password: "LegacyPassword123" }); ids.push(customer.id);
    const session = await createWebCustomerSession({ customerId: customer.id });
    await prisma.wallet.create({ data: { chatId: webCustomerChatId(customer.id), balance: 12500 } });
    mockIdentity(email);
    const linked = await connectClerkCustomer(`clerk:user_${key}`, "LegacyPassword123");
    expect(linked.id).toBe(customer.id);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { chatId: webCustomerChatId(customer.id) } })).balance).toBe(12500);
    expect(await prisma.webCustomerSession.count({ where: { webCustomerId: customer.id, revokedAt: null } })).toBe(0);
    expect(session.token).toBeTruthy();
  });
});
