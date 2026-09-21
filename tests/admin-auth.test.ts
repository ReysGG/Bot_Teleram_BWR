import { afterEach, describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import {
  createAdminSessionToken,
  verifyAdminPassword,
  verifyAdminSessionToken,
} from "@/server/security/admin-auth";

const originalEmail = process.env.ADMIN_EMAIL;
const originalHash = process.env.ADMIN_PASSWORD_HASH;
const originalAuthSecret = process.env.AUTH_SECRET;

afterEach(() => {
  if (originalEmail === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = originalEmail;
  if (originalHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
  else process.env.ADMIN_PASSWORD_HASH = originalHash;
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalAuthSecret;
});

describe("admin session invalidation", () => {
  it("invalidates existing sessions when the admin password hash changes", async () => {
    process.env.ADMIN_EMAIL = "admin@test.local";
    process.env.AUTH_SECRET = "a".repeat(32);
    process.env.ADMIN_PASSWORD_HASH = await hash("first-password", 4);
    const token = createAdminSessionToken(process.env.ADMIN_EMAIL);

    expect(verifyAdminSessionToken(token)?.email).toBe(process.env.ADMIN_EMAIL);

    process.env.ADMIN_PASSWORD_HASH = await hash("replacement-password", 4);
    expect(verifyAdminSessionToken(token)).toBeNull();
  });
});

describe("admin password verification", () => {
  it("rejects plaintext configuration as a setup error", async () => {
    process.env.ADMIN_EMAIL = "admin@test.local";
    process.env.ADMIN_PASSWORD_HASH = "plaintext-password";

    await expect(
      verifyAdminPassword("admin@test.local", "plaintext-password"),
    ).rejects.toThrow("bcrypt hash");
  });

  it("accepts the matching password for a valid bcrypt hash", async () => {
    process.env.ADMIN_EMAIL = "admin@test.local";
    process.env.ADMIN_PASSWORD_HASH = await hash("correct-password", 4);

    await expect(
      verifyAdminPassword("admin@test.local", "correct-password"),
    ).resolves.toBe(true);
  });
});
