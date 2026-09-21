import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("admin response headers", () => {
  it("preserves same-origin login form metadata for CSRF validation", async () => {
    const configuredHeaders = await nextConfig.headers?.();
    const adminHeaders = configuredHeaders?.find((entry) => entry.source === "/admin/:path*");
    const referrerPolicy = adminHeaders?.headers.find(
      (header) => header.key === "Referrer-Policy",
    );

    expect(referrerPolicy?.value).toBe("same-origin");
  });
});
