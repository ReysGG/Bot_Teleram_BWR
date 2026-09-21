import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ signed: vi.fn(), json: vi.fn(), owner: vi.fn(), read: vi.fn(), mutate: vi.fn() }));
vi.mock("@/server/storefront/auth", () => ({ authenticateStorefrontRequest: f.signed }));
vi.mock("@/server/storefront/http", () => ({ authenticateStorefrontJsonRequest: f.json, storefrontBearerToken: () => "clerk:token", storefrontAuthenticationResponse: () => NextResponse.json({ ok: false }, { status: 401 }) }));
vi.mock("@/server/storefront/clerk-identity", () => ({ requireClerkCustomer: f.owner, ClerkCommerceError: class extends Error { constructor(public code: string) { super(code); } } }));
vi.mock("@/server/storefront/cart", () => ({ readWebCart: f.read, mutateWebCart: f.mutate }));
import { GET, POST } from "@/app/api/storefront/v1/cart/route";
import { ClerkCommerceError } from "@/server/storefront/clerk-identity";

const command = { action: "add", productId: "p1", quantity: 1, expectedRevision: 0, idempotencyKey: "69ca5ec0-1000-4000-8000-012345678901" };
describe("cart API ownership boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks(); f.signed.mockReturnValue({ ok: true }); f.json.mockResolvedValue({ ok: true, body: command });
    f.owner.mockResolvedValue({ id: "verified-owner" }); f.read.mockResolvedValue({ revision: 0, items: [] }); f.mutate.mockResolvedValue({ revision: 1, items: [] });
  });
  it("never reads a cart for an unsigned request", async () => {
    f.signed.mockReturnValue({ ok: false });
    expect((await GET(new NextRequest("https://test.example/api/storefront/v1/cart"))).status).toBe(401);
    expect(f.read).not.toHaveBeenCalled();
  });
  it("requires a verified linked customer before any cart mutation", async () => {
    f.owner.mockRejectedValue(new ClerkCommerceError("sign_in_required"));
    expect((await POST(new NextRequest("https://test.example/api/storefront/v1/cart", { method: "POST" }))).status).toBe(401);
    expect(f.mutate).not.toHaveBeenCalled();
  });
  it("takes ownership only from the authenticated customer", async () => {
    expect((await POST(new NextRequest("https://test.example/api/storefront/v1/cart", { method: "POST" }))).status).toBe(200);
    expect(f.mutate).toHaveBeenCalledWith("verified-owner", command);
  });
  it("rejects body-supplied customer identity", async () => {
    f.json.mockResolvedValue({ ok: true, body: { ...command, webCustomerId: "victim" } });
    expect((await POST(new NextRequest("https://test.example/api/storefront/v1/cart", { method: "POST" }))).status).toBe(422);
    expect(f.mutate).not.toHaveBeenCalled();
  });
  it("marks private cart responses no-store", async () => {
    const response = await GET(new NextRequest("https://test.example/api/storefront/v1/cart"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(f.read).toHaveBeenCalledWith("verified-owner");
  });
});
