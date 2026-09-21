import { describe, expect, it, vi } from "vitest";
import { loadAccountCart } from "../storefront/src/lib/load-account-cart";

const cart = { revision: 0, items: [] };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function options(request: ReturnType<typeof vi.fn>, overrides = {}) {
  return { request: request as typeof fetch, allowSetup: true, isCurrent: () => true,
    onSetupStarted: vi.fn(), onPrepared: vi.fn(), ...overrides };
}

describe("automatic Web account setup", () => {
  it("reads existing accounts without a write", async () => {
    const request = vi.fn().mockResolvedValue(reply({ ok: true, cart }));
    expect(await loadAccountCart(options(request))).toEqual({ ok: true, cart });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("retries one rejected cart read with a fresh browser session token", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(reply({ ok: false, code: "sign_in_required" }, 401))
      .mockResolvedValueOnce(reply({ ok: true, cart }));
    const authorization = vi.fn(async (fresh = false) => fresh ? "Bearer fresh.jwt.signature" : "Bearer cached.jwt.signature");
    expect(await loadAccountCart(options(request, { authorization }))).toEqual({ ok: true, cart });
    expect(request).toHaveBeenCalledTimes(2);
    expect(authorization.mock.calls).toEqual([[false], [true]]);
    expect((request.mock.calls[0][1].headers as Headers).get("authorization")).toBe("Bearer cached.jwt.signature");
    expect((request.mock.calls[1][1].headers as Headers).get("authorization")).toBe("Bearer fresh.jwt.signature");
  });

  it("keeps the refreshed token through first-account setup and the final cart read", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(reply({ ok: false, code: "sign_in_required" }, 401))
      .mockResolvedValueOnce(reply({ ok: false, code: "account_setup_required" }, 409))
      .mockResolvedValueOnce(reply({ ok: true }))
      .mockResolvedValueOnce(reply({ ok: true, cart }));
    const authorization = vi.fn(async (fresh = false) => fresh ? "Bearer fresh.jwt.signature" : "Bearer cached.jwt.signature");
    expect(await loadAccountCart(options(request, { authorization }))).toEqual({ ok: true, cart });
    expect(authorization.mock.calls).toEqual([[false], [true], [true], [true]]);
    expect(request.mock.calls.map(call => call[0])).toEqual(["/api/cart", "/api/cart", "/api/customer/account", "/api/cart"]);
    for (const index of [1, 2, 3]) {
      expect((request.mock.calls[index][1].headers as Headers).get("authorization")).toBe("Bearer fresh.jwt.signature");
    }
  });

  it("creates a new account through authenticated POST then refreshes the cart", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(reply({ ok: false, code: "account_setup_required" }, 409))
      .mockResolvedValueOnce(reply({ ok: true }))
      .mockResolvedValueOnce(reply({ ok: true, cart }));
    const input = options(request);
    expect(await loadAccountCart(input)).toEqual({ ok: true, cart });
    expect(request.mock.calls.map(call => call[0])).toEqual(["/api/cart", "/api/customer/account", "/api/cart"]);
    expect(request.mock.calls[1][1]).toMatchObject({ method: "POST", body: "{}" });
    expect(input.onPrepared).toHaveBeenCalledTimes(1);
  });

  it.each(["account_link_required", "email_verification_required", "invalid_credentials"])("does not bypass %s", async code => {
    const request = vi.fn()
      .mockResolvedValueOnce(reply({ ok: false, code: "account_setup_required" }, 409))
      .mockResolvedValueOnce(reply({ ok: false, code }, 409));
    const input = options(request);
    expect(await loadAccountCart(input)).toEqual({ ok: false, code });
    expect(request).toHaveBeenCalledTimes(2);
    expect(input.onPrepared).not.toHaveBeenCalled();
  });

  it.each([[401, "sign_in_required"], [503, "account_unavailable"]])("does not provision after HTTP %s", async (status, code) => {
    const request = vi.fn().mockResolvedValue(reply({ ok: false, code }, status as number));
    expect(await loadAccountCart(options(request))).toEqual({ ok: false, code });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not retry automatic provisioning after the owner's attempt was consumed", async () => {
    const request = vi.fn().mockResolvedValue(reply({ ok: false, code: "account_setup_required" }, 409));
    await loadAccountCart(options(request, { allowSetup: false }));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not create an account if the user changed while the first read was pending", async () => {
    const request = vi.fn().mockResolvedValue(reply({ ok: false, code: "account_setup_required" }, 409));
    expect(await loadAccountCart(options(request, { isCurrent: () => false }))).toEqual({ ok: false, code: "account_changed" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not return another session's cart after provisioning", async () => {
    let current = true;
    const request = vi.fn()
      .mockResolvedValueOnce(reply({ ok: false, code: "account_setup_required" }, 409))
      .mockResolvedValueOnce(reply({ ok: true }))
      .mockImplementationOnce(async () => { current = false; return reply({ ok: true, cart }); });
    expect(await loadAccountCart(options(request, { isCurrent: () => current }))).toEqual({ ok: false, code: "account_changed" });
  });
});
