import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), getToken: vi.fn(), cookies: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
import { commerceAccessToken } from "../src/lib/commerce-auth";
beforeEach(() => {
  vi.stubEnv("STOREFRONT_CLERK_COMMERCE_ENABLED", "true");
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user_test", getToken: mocks.getToken });
});
afterEach(() => vi.unstubAllEnvs());
it("preserves the request token including its browser origin without minting a replacement", async () => {
  const payload = Buffer.from(JSON.stringify({ azp: "https://store.example.test" })).toString("base64url");
  const token = `header.${payload}.signature`;
  mocks.getToken.mockImplementation(async (...args: unknown[]) => {
    if (args.length) throw new Error("BAPI replacement loses browser origin");
    return token;
  });
  expect(await commerceAccessToken()).toBe(`clerk:${token}`);
  expect(mocks.getToken).toHaveBeenCalledExactlyOnceWith();
});
it("keeps anonymous requests unauthenticated without consulting a legacy cookie", async () => {
  mocks.auth.mockResolvedValue({ userId: null });
  expect(await commerceAccessToken()).toBeUndefined();
  expect(mocks.cookies).not.toHaveBeenCalled();
  expect(mocks.getToken).not.toHaveBeenCalled();
});
