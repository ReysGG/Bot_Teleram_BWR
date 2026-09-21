import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyClerkCommerceToken } from "@/server/storefront/clerk-identity";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
function token(overrides: Record<string, unknown> = {}, signingKey = keys.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "local-test" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "https://test.clerk.accounts.dev", sub: "user_owner", sid: "sess_active", azp: "http://localhost:3001", iat: now - 1, nbf: now - 1, exp: now + 59, ...overrides })).toString("base64url");
  return `clerk:${header}.${payload}.${sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), signingKey).toString("base64url")}`;
}
describe("Clerk commerce token boundary (local cryptography, no DB/network)", () => {
  beforeEach(() => {
    vi.stubEnv("STOREFRONT_CLERK_ENABLED", "true");
    vi.stubEnv("STOREFRONT_CLERK_ISSUER", "https://test.clerk.accounts.dev");
    vi.stubEnv("STOREFRONT_CLERK_AUTHORIZED_PARTIES", "http://localhost:3001");
    vi.stubEnv("STOREFRONT_CLERK_JWT_KEY", keys.publicKey.export({ type: "spki", format: "pem" }).toString());
  });
  afterEach(() => vi.unstubAllEnvs());
  it("verifies a signed session and returns only its stable identity", async () => {
    await expect(verifyClerkCommerceToken(token())).resolves.toEqual({ issuer: "https://test.clerk.accounts.dev", userId: "user_owner" });
  });
  it.each([
    { iss: "https://other.clerk.accounts.dev" }, { azp: "https://attacker.example" },
    { azp: undefined }, { exp: 1 }, { sid: undefined }, { sts: "pending" },
    { sub: "machine_identity" }, { nbf: Math.floor(Date.now() / 1000) + 1000 },
    { exp: Math.floor(Date.now() / 1000) + 3600 },
  ])("rejects mismatched or unsafe session claims %j", async overrides => {
    await expect(verifyClerkCommerceToken(token(overrides))).rejects.toMatchObject({ code: "sign_in_required" });
  });
  it("rejects a signature from another key", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await expect(verifyClerkCommerceToken(token({}, other.privateKey))).rejects.toMatchObject({ code: "sign_in_required" });
  });
  it("fails closed while disabled or missing its explicit origin allowlist", async () => {
    vi.stubEnv("STOREFRONT_CLERK_ENABLED", "false");
    await expect(verifyClerkCommerceToken(token())).rejects.toMatchObject({ code: "account_unavailable" });
    vi.stubEnv("STOREFRONT_CLERK_ENABLED", "true"); vi.stubEnv("STOREFRONT_CLERK_AUTHORIZED_PARTIES", "");
    await expect(verifyClerkCommerceToken(token())).rejects.toMatchObject({ code: "account_unavailable" });
  });
  it("does not trust a development Clerk instance in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(verifyClerkCommerceToken(token())).rejects.toMatchObject({ code: "account_unavailable" });
  });
});
