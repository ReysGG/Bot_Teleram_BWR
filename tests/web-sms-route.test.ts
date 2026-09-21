import { NextRequest, NextResponse } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signed: vi.fn(), customer: vi.fn(), enabled: vi.fn(), purchase: vi.fn(), orders: vi.fn(), owned: vi.fn(), cancel: vi.fn(), refresh: vi.fn() }));
vi.mock("@/server/storefront/auth", () => ({ authenticateStorefrontRequest: mocks.signed }));
vi.mock("@/server/storefront/http", () => ({
  authenticateStorefrontJsonRequest: async (r: NextRequest) => ({ ok: true, body: await r.json() }),
  storefrontBearerToken: () => "test-token", storefrontAuthenticationResponse: () => NextResponse.json({ ok: false }, { status: 401 }),
}));
vi.mock("@/server/storefront/clerk-identity", () => ({ ClerkCommerceError: class extends Error { code = "sign_in_required"; }, requireClerkCustomer: mocks.customer }));
vi.mock("@/server/storefront/sms", () => ({ webSmsEnabled: mocks.enabled, publicWebSmsOrder: (o: unknown) => o, webSmsCatalog: vi.fn(), webSmsOrders: mocks.orders, requireWebSmsOrder: mocks.owned, webSmsFailure: (e: Error) => e.message }));
vi.mock("@/server/smspool/customer-orders", () => ({ purchaseSmsPoolForWebCustomer: mocks.purchase, cancelSmsPoolCustomerOrder: mocks.cancel, refreshSmsPoolCustomerOrder: mocks.refresh }));
import { GET, POST } from "@/app/api/storefront/v1/sms/route";
import { POST as action } from "@/app/api/storefront/v1/sms/orders/[id]/route";
const input = { serviceId: 1, countryId: 2, expectedPrice: 7000, idempotencyKey: "533021e4-b76a-43e7-b8f4-8b331d769855" };
const request = (body: unknown) => new NextRequest("https://store.example/api/storefront/v1/sms", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.signed.mockReturnValue({ ok: true }); mocks.customer.mockResolvedValue({ id: "owner" }); mocks.enabled.mockReturnValue(true); mocks.purchase.mockResolvedValue({ id: "order" }); mocks.orders.mockResolvedValue({ orders: [], nextCursor: null }); });
it("rejects unsigned catalog requests before resolving a user", async () => {
  mocks.signed.mockReturnValue({ ok: false }); expect((await GET(new NextRequest("https://store.example/api/storefront/v1/sms"))).status).toBe(401); expect(mocks.customer).not.toHaveBeenCalled();
});
it("derives purchase ownership from the authenticated customer", async () => {
  const r = await POST(request(input)); expect(r.status).toBe(200); expect(mocks.purchase).toHaveBeenCalledWith({ ...input, customerId: "owner" }); expect(r.headers.get("cache-control")).toContain("no-store");
});
it("rejects injected owner fields and malformed quotes", async () => {
  expect((await POST(request({ ...input, customerId: "other" }))).status).toBe(422);
  expect((await POST(request({ ...input, expectedPrice: -1 }))).status).toBe(422); expect(mocks.purchase).not.toHaveBeenCalled();
});
it("keeps history readable when new SMS purchases are disabled", async () => {
  mocks.enabled.mockReturnValue(false);
  expect((await GET(new NextRequest("https://store.example/api/storefront/v1/sms?view=orders"))).status).toBe(200);
  expect((await POST(request(input))).status).toBe(503); expect(mocks.purchase).not.toHaveBeenCalled();
});
it("does not cancel or refresh an order owned by someone else", async () => {
  mocks.owned.mockRejectedValue(new Error("sms_order_missing"));
  const result = await action(request({ action: "cancel" }), { params: Promise.resolve({ id: "other-order" }) });
  expect(result.status).toBe(404); expect(mocks.owned).toHaveBeenCalledWith("owner", "other-order"); expect(mocks.cancel).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled();
});
