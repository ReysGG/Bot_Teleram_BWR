import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ signed: vi.fn(), customer: vi.fn(), create: vi.fn(), order: vi.fn() }));
vi.mock("@/server/storefront/http", () => ({ authenticateStorefrontJsonRequest: f.signed, storefrontBearerToken: () => "clerk:verified-token" }));
vi.mock("@/server/storefront/clerk-identity", () => ({ requireClerkCustomer: f.customer, ClerkCommerceError: class extends Error {} }));
vi.mock("@/server/checkout/create-order", () => ({ createDigitalOrder: f.create }));
vi.mock("@/server/storefront/orders", () => ({ getWebCustomerOrder: f.order }));
import { POST } from "@/app/api/storefront/v1/account/checkouts/route";

const input = { productId: "product-one", quantity: 2, paymentMethod: "WALLET_QRIS", idempotencyKey: "web:checkout-idempotency-123" };
describe("Clerk checkout uses the existing transactional command", () => {
  beforeEach(() => {
    vi.resetAllMocks(); f.signed.mockResolvedValue({ ok: true, body: input });
    f.customer.mockResolvedValue({ id: "real-owner" });
    f.create.mockResolvedValue({ invoiceNumber: "TGS-TEST" }); f.order.mockResolvedValue({ invoiceNumber: "TGS-TEST" });
  });
  it.each(["WALLET", "WALLET_QRIS", "DANA"])("routes %s through createDigitalOrder without a parallel money path", async method => {
    f.signed.mockResolvedValue({ ok: true, body: { ...input, paymentMethod: method } });
    const response = await POST(new NextRequest("https://store.example/api/storefront/v1/account/checkouts", { method: "POST" }));
    expect(response.status).toBe(201);
    expect(f.create).toHaveBeenCalledWith({ ...input, paymentMethod: method, channel: "WEB", webCustomerId: "real-owner", chatId: "web:real-owner" });
    expect(f.order).toHaveBeenCalledWith("real-owner", "TGS-TEST");
  });
  it.each([{ webCustomerId: "victim" }, { email: "victim@example.com" }, { chatId: "123" }, { walletBalance: 999999 }, { amount: 1 }])("rejects browser-supplied ownership/pricing %j", async extra => {
    f.signed.mockResolvedValue({ ok: true, body: { ...input, ...extra } });
    expect((await POST(new NextRequest("https://store.example/api/storefront/v1/account/checkouts", { method: "POST" }))).status).toBe(422);
    expect(f.create).not.toHaveBeenCalled();
  });
  it("never creates an order after an identity-verifier failure", async () => {
    f.customer.mockRejectedValue(new Error("upstream unavailable"));
    const response = await POST(new NextRequest("https://store.example/api/storefront/v1/account/checkouts", { method: "POST" }));
    expect(response.status).toBe(503); expect(f.create).not.toHaveBeenCalled();
  });
});
