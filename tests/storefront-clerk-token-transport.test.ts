import { describe, expect, it } from "vitest";
import { clerkCommerceTokenFromAuthorization } from "../storefront/src/lib/clerk-token-transport";

const jwt = ["eyJhbGciOiJSUzI1NiJ9", "eyJzdWIiOiJ1c2VyX3Rlc3QifQ", "c2lnbmF0dXJl"].join(".");

describe("storefront Clerk token transport", () => {
  it("accepts one well-formed Bearer JWT for backend verification", () => {
    expect(clerkCommerceTokenFromAuthorization(`Bearer ${jwt}`)).toBe(`clerk:${jwt}`);
  });

  it.each([
    null,
    "",
    `Basic ${jwt}`,
    "Bearer one.two",
    "Bearer one.two.three.four",
    "Bearer one.two.bad+signature",
    "Bearer one.two. three",
  ])("rejects malformed authorization %j", value => {
    expect(clerkCommerceTokenFromAuthorization(value)).toBeUndefined();
  });

  it("rejects an oversized token before it reaches backend verification", () => {
    expect(clerkCommerceTokenFromAuthorization(`Bearer a.${"b".repeat(16_384)}.c`)).toBeUndefined();
  });
});
