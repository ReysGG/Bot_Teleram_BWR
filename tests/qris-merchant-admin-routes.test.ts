import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  archive: vi.fn(),
  create: vi.fn(() => ({ id: "merchant-1" })),
  update: vi.fn(),
  errorCode: vi.fn<(error: unknown) => string | null>(() => null),
  legacyErrorCode: vi.fn<(error: unknown) => string | null>(() => null),
  setLegacy: vi.fn(),
  importLegacy: vi.fn(() => ({ merchantId: "merchant-imported" })),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: vi.fn(),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
}));

vi.mock("@/server/payment/qris-merchant-service", () => ({
  activateQrisMerchant: mocks.activate,
  archiveQrisMerchant: mocks.archive,
  createQrisMerchant: mocks.create,
  qrisMerchantErrorCode: mocks.errorCode,
  updateQrisMerchant: mocks.update,
}));

vi.mock("@/server/payment/qris-legacy-service", () => ({
  importLegacyQrisFallback: mocks.importLegacy,
  legacyQrisErrorCode: mocks.legacyErrorCode,
  setLegacyQrisFallbackEnabled: mocks.setLegacy,
}));

import { POST as createMerchant } from "@/app/api/admin/payment-settings/qris/route";
import { POST as updateMerchant } from "@/app/api/admin/payment-settings/qris/[id]/route";
import { POST as activateMerchant } from "@/app/api/admin/payment-settings/qris/[id]/activate/route";
import { POST as useLegacyQris } from "@/app/api/admin/payment-settings/qris/legacy/use/route";
import { POST as disableLegacyQris } from "@/app/api/admin/payment-settings/qris/legacy/disable/route";
import { POST as importLegacyQris } from "@/app/api/admin/payment-settings/qris/legacy/import/route";

function formRequest(path: string, body: URLSearchParams) {
  return new NextRequest(`https://store.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://store.example",
    },
    body,
  });
}

describe("admin QRIS merchant routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a merchant without reflecting its decoded payload in the redirect", async () => {
    const payload = "00020101021126080004TEST6304ABCD";
    const response = await createMerchant(formRequest(
      "/api/admin/payment-settings/qris",
      new URLSearchParams({
        slug: "qris-primary",
        name: "QRIS Primary",
        providerKey: "DANA",
        basePayload: payload,
        enabled: "true",
        trustedDeviceId: "device-primary-123",
      }),
    ));

    expect(mocks.create).toHaveBeenCalledWith({
      slug: "qris-primary",
      name: "QRIS Primary",
      providerKey: "DANA",
      basePayload: payload,
      enabled: true,
      activateAfterSave: false,
      trustedDeviceId: "device-primary-123",
      actor: "admin:owner@example.test",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings/qris/merchant-1?notice=qris_created",
    );
    expect(response.headers.get("location")).not.toContain(payload);
  });

  it("redirects with an active notice when create-and-activate is requested", async () => {
    const response = await createMerchant(formRequest(
      "/api/admin/payment-settings/qris",
      new URLSearchParams({
        slug: "qris-primary",
        name: "QRIS Primary",
        providerKey: "DANA",
        basePayload: "00020101021126080004TEST6304ABCD",
        enabled: "false",
        activateAfterSave: "true",
        trustedDeviceId: "",
      }),
    ));

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      activateAfterSave: true,
      enabled: false,
    }));
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings/qris/merchant-1?notice=qris_created_active",
    );
  });

  it("preserves the encrypted payload when the optional edit field is blank", async () => {
    const response = await updateMerchant(
      formRequest(
        "/api/admin/payment-settings/qris/merchant-1",
        new URLSearchParams({
          slug: "qris-primary",
          name: "QRIS Primary Updated",
          providerKey: "DANA",
          basePayload: "",
          enabled: "true",
          trustedDeviceId: "",
        }),
      ),
      { params: Promise.resolve({ id: "merchant-1" }) },
    );

    expect(mocks.update).toHaveBeenCalledWith({
      id: "merchant-1",
      slug: "qris-primary",
      name: "QRIS Primary Updated",
      providerKey: "DANA",
      enabled: true,
      trustedDeviceId: "",
      actor: "admin:owner@example.test",
    });
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings/qris/merchant-1?notice=qris_updated",
    );
  });

  it("passes only the selected Shopee session ID to the merchant service", async () => {
    const response = await createMerchant(formRequest(
      "/api/admin/payment-settings/qris",
      new URLSearchParams({
        slug: "shopee-qris",
        name: "Shopee QRIS",
        providerKey: "SHOPEE_PARTNER",
        basePayload: "00020101021126080004TEST6304ABCD",
        enabled: "false",
        activateAfterSave: "false",
        trustedDeviceId: "device-primary-123",
        shopeeSessionId: "session-validated-1",
      }),
    ));

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "SHOPEE_PARTNER",
      shopeeSessionId: "session-validated-1",
    }));
    expect(JSON.stringify(mocks.create.mock.calls)).not.toContain("cookie");
    expect(response.status).toBe(303);
  });

  it("forwards a Shopee session binding on merchant edits without accepting a fingerprint", async () => {
    await updateMerchant(
      formRequest(
        "/api/admin/payment-settings/qris/merchant-1",
        new URLSearchParams({
          slug: "shopee-qris",
          name: "Shopee QRIS",
          providerKey: "SHOPEE_PARTNER",
          basePayload: "",
          enabled: "true",
          trustedDeviceId: "device-primary-123",
          shopeeSessionId: "session-validated-2",
        }),
      ),
      { params: Promise.resolve({ id: "merchant-1" }) },
    );

    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      id: "merchant-1",
      shopeeSessionId: "session-validated-2",
    }));
    expect(JSON.stringify(mocks.update.mock.calls)).not.toContain("Fingerprint");
  });

  it("rejects an unsafe activation return URL and uses the merchant detail page", async () => {
    const response = await activateMerchant(
      formRequest(
        "/api/admin/payment-settings/qris/merchant-1/activate",
        new URLSearchParams({ returnTo: "https://attacker.example/steal" }),
      ),
      { params: Promise.resolve({ id: "merchant-1" }) },
    );

    expect(mocks.activate).toHaveBeenCalledWith({
      id: "merchant-1",
      actor: "admin:owner@example.test",
    });
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings/qris/merchant-1?notice=qris_activated",
    );
  });

  it("returns stable domain error codes without exposing service messages", async () => {
    mocks.create.mockRejectedValueOnce(new Error("secret payload value"));
    mocks.errorCode.mockReturnValueOnce("INVALID_STATIC_PAYLOAD");
    const response = await createMerchant(formRequest(
      "/api/admin/payment-settings/qris",
      new URLSearchParams({
        slug: "qris-primary",
        name: "QRIS Primary",
        providerKey: "DANA",
        basePayload: "00020101021126080004TEST6304ABCD",
        enabled: "true",
        activateAfterSave: "false",
        trustedDeviceId: "",
      }),
    ));

    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings/qris/new?error=invalid_static_payload",
    );
    expect(response.headers.get("location")).not.toContain("secret");
  });

  it("selects and disables the legacy QRIS source explicitly", async () => {
    const useResponse = await useLegacyQris(formRequest(
      "/api/admin/payment-settings/qris/legacy/use",
      new URLSearchParams(),
    ));
    const disableResponse = await disableLegacyQris(formRequest(
      "/api/admin/payment-settings/qris/legacy/disable",
      new URLSearchParams(),
    ));

    expect(mocks.setLegacy).toHaveBeenNthCalledWith(1, {
      enabled: true,
      actor: "admin:owner@example.test",
    });
    expect(mocks.setLegacy).toHaveBeenNthCalledWith(2, {
      enabled: false,
      actor: "admin:owner@example.test",
    });
    expect(useResponse.headers.get("location")).toContain("notice=legacy_qris_selected");
    expect(disableResponse.headers.get("location")).toContain("notice=legacy_qris_disabled");
  });

  it("imports the legacy payload without exposing it in the redirect", async () => {
    const response = await importLegacyQris(formRequest(
      "/api/admin/payment-settings/qris/legacy/import",
      new URLSearchParams(),
    ));

    expect(mocks.importLegacy).toHaveBeenCalledWith({
      actor: "admin:owner@example.test",
    });
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings/qris/merchant-imported?notice=legacy_qris_imported",
    );
  });
});
