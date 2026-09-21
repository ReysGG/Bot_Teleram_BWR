import { afterEach, describe, expect, it } from "vitest";
import { appRoute } from "@/server/env";

const originalAppUrl = process.env.APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
});

describe("application redirects", () => {
  it("uses APP_URL instead of the container bind address", () => {
    process.env.APP_URL = "http://localhost:3000";
    expect(appRoute("/admin/login?error=invalid").toString()).toBe(
      "http://localhost:3000/admin/login?error=invalid",
    );
  });
});
