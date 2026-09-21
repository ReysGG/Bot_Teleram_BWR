import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), origin: vi.fn(), limit: vi.fn(), search: vi.fn() }));
vi.mock("@/server/security/admin-auth", () => ({ requireAdminRequest: mocks.auth, assertAdminOrigin: mocks.origin }));
vi.mock("@/server/security/rate-limit", () => ({ consumeRateLimit: mocks.limit }));
vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/admin/inventory-content-search", () => ({ searchInventoryContent: mocks.search }));
import { POST } from "@/app/api/admin/inventory/search/route";
const req = (body = '{"query":"CDK-test"}') => new NextRequest("https://example.test/api/admin/inventory/search", { method: "POST", body });
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockReturnValue({ email: "owner@example.test" }); mocks.limit.mockReturnValue(true); mocks.search.mockResolvedValue({ matches: [], next: null, scanned: 0 }); });
it("blocks unauthenticated and cross-origin decryption", async () => {
  mocks.auth.mockImplementationOnce(() => { throw new Error(); });
  expect((await POST(req())).status).toBe(401);
  mocks.origin.mockImplementationOnce(() => { throw new Error(); });
  expect((await POST(req())).status).toBe(403);
  expect(mocks.search).not.toHaveBeenCalled();
});
it("does not cache the authenticated response or echo the search credential", async () => {
  const response = await POST(req()); expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.text()).not.toContain("CDK-test");
});
it("bounds queries and actual body size", async () => {
  expect((await POST(req('{"query":"a"}'))).status).toBe(400);
  expect((await POST(req("a".repeat(4097)))).status).toBe(413);
  expect(mocks.search).not.toHaveBeenCalled();
});
it("rate limits and hides internal error details", async () => {
  mocks.limit.mockReturnValueOnce(false); expect((await POST(req())).status).toBe(429);
  mocks.search.mockRejectedValueOnce(new Error("SECRET-CONTENT"));
  const response = await POST(req()); expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("SECRET-CONTENT");
});
