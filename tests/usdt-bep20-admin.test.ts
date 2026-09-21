import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canRecheckUsdtBep20Attempt,
  parseUsdtBep20LedgerStatus,
  usdtBep20StatusPresentation,
} from "@/server/admin/usdt-bep20-ledger";

const mocks = vi.hoisted(() => ({
  setSetting: vi.fn(),
  verify: vi.fn(),
  getPaymentMethods: vi.fn(() => ({ usdtBep20Enabled: true })),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: vi.fn(),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
}));

vi.mock("@/server/payment/usdt-bep20-setting", () => ({
  setUsdtBep20Setting: mocks.setSetting,
}));

vi.mock("@/server/payment/method-availability", () => ({
  getPaymentMethodAvailability: mocks.getPaymentMethods,
}));

vi.mock("@/server/payment/usdt-bep20", () => ({
  verifyUsdtBep20Attempt: mocks.verify,
}));

import { POST as updateSetting } from "@/app/api/admin/payment-settings/usdt-bep20/route";
import { POST as recheckAttempt } from "@/app/api/admin/usdt-bep20/[id]/recheck/route";

function formRequest(path: string, body?: URLSearchParams) {
  return new NextRequest(`https://store.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://store.example",
    },
    body: body ?? new URLSearchParams(),
  });
}

describe("admin USDT BEP20 operations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves only the editable on-chain settings", async () => {
    const recipientAddress = "0x1111111111111111111111111111111111111111";
    const response = await updateSetting(formRequest(
      "/api/admin/payment-settings/usdt-bep20",
      new URLSearchParams({
        enabled: "false",
        recipientAddress,
        minimumConfirmations: "12",
      }),
    ));

    expect(mocks.setSetting).toHaveBeenCalledWith({
      enabled: true,
      recipientAddress,
      requiredConfirmations: 12,
      actor: "admin:owner@example.test",
    });
    expect(mocks.getPaymentMethods).toHaveBeenCalledTimes(1);
    expect(mocks.setSetting.mock.calls[0][0]).not.toHaveProperty("rpc");
    expect(mocks.setSetting.mock.calls[0][0]).not.toHaveProperty("tokenContract");
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings/usdt-bep20?notice=usdt_bep20_settings",
    );
  });

  it("rechecks through the on-chain verifier without a manual confirmation path", async () => {
    const response = await recheckAttempt(
      formRequest(
        "/api/admin/usdt-bep20/attempt-1/recheck",
        new URLSearchParams({
          returnTo: "/admin/payments/usdt-bep20?up=4&uq=invoice&us=VERIFYING#usdt-bep20-ledger",
        }),
      ),
      { params: Promise.resolve({ id: "attempt-1" }) },
    );

    expect(mocks.verify).toHaveBeenCalledWith({ attemptId: "attempt-1" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payments/usdt-bep20?up=4&uq=invoice&us=VERIFYING&notice=usdt_bep20_rechecked#usdt-bep20-ledger",
    );
  });

  it("does not expose verifier errors in redirects", async () => {
    mocks.verify.mockRejectedValueOnce(new Error("BSC_RPC_URL=https://secret.example"));
    const response = await recheckAttempt(
      formRequest("/api/admin/usdt-bep20/attempt-2/recheck"),
      { params: Promise.resolve({ id: "attempt-2" }) },
    );

    expect(response.headers.get("location")).toContain("error=usdt_bep20_recheck");
    expect(response.headers.get("location")).not.toContain("secret");
  });
});

describe("USDT BEP20 ledger presentation", () => {
  it("accepts only known status filters", () => {
    expect(parseUsdtBep20LedgerStatus("PENDING_CONFIRMATIONS")).toBe("PENDING_CONFIRMATIONS");
    expect(parseUsdtBep20LedgerStatus("PAID_MANUALLY")).toBeUndefined();
  });

  it("offers recheck only for active attempts with a transaction hash", () => {
    expect(canRecheckUsdtBep20Attempt({ status: "VERIFYING", txHash: "0xabc" })).toBe(true);
    expect(canRecheckUsdtBep20Attempt({ status: "CONFIRMED", txHash: "0xabc" })).toBe(false);
    expect(canRecheckUsdtBep20Attempt({ status: "VERIFYING", txHash: null })).toBe(false);
  });

  it("shows the stored rejection diagnostic to admins", () => {
    expect(usdtBep20StatusPresentation("REJECTED", "Nominal transfer tidak cocok.")).toEqual({
      label: "Ditolak",
      tone: "bad",
      diagnostic: "Nominal transfer tidak cocok.",
    });
  });
});
