import { describe, expect, it } from "vitest";
import {
  adminOrderPaymentRecoveryAction,
  adminWalletTopupRecoveryAction,
} from "@/server/payment/admin-recovery-policy";
import {
  adminResultReturnPath,
  buildAdminReturnPath,
  normalizeAdminReturnPath,
} from "@/server/admin/return-path";
import {
  orderPaymentMethodMatchesProvider,
  orderPaymentMethodsForProvider,
  walletTopupPaymentMethodForProvider,
} from "@/server/payment/provider-methods";

const now = new Date("2026-08-23T10:00:00.000Z");
const activeExpiry = new Date("2026-08-23T10:05:00.000Z");
const expiredAt = new Date("2026-08-23T09:55:00.000Z");

function orderAction(overrides: Record<string, unknown> = {}) {
  return adminOrderPaymentRecoveryAction({
    orderStatus: "PENDING_PAYMENT",
    orderPaymentStatus: "PENDING",
    paymentStatus: "PENDING",
    paymentMethod: "JAGO_TRANSFER",
    expiresAt: activeExpiry,
    now,
    ...overrides,
  });
}

describe("shared admin payment recovery policy", () => {
  it.each(["DANA_RELAY", "WALLET_QRIS", "JAGO_TRANSFER"])(
    "allows active external IDR method %s",
    (paymentMethod) => {
      expect(orderAction({ paymentMethod })).toMatchObject({
        kind: "CONFIRM_ACTIVE",
      });
    },
  );

  it("never offers a stale pending invoice as an approvable payment", () => {
    expect(orderAction({ expiresAt: expiredAt })).toEqual({
      kind: "BLOCKED",
      reason: "AWAITING_EXPIRY_WORKER",
    });
  });

  it("routes fully expired external payments to wallet recovery", () => {
    expect(orderAction({
      orderStatus: "EXPIRED",
      orderPaymentStatus: "EXPIRED",
      paymentStatus: "EXPIRED",
      expiresAt: expiredAt,
    })).toMatchObject({ kind: "CREDIT_EXPIRED_TO_WALLET", provider: "JAGO" });
  });

  it("keeps wallet separate and routes active crypto to the shared manual review", () => {
    expect(orderAction({ paymentMethod: "WALLET" })).toEqual({
      kind: "BLOCKED",
      reason: "METHOD_NOT_MANUAL",
    });
    expect(orderAction({ paymentMethod: "BINANCE_INTERNAL" })).toEqual({
      kind: "REVIEW_MANUAL_CRYPTO",
      provider: "BINANCE",
    });
    expect(orderAction({ paymentMethod: "USDT_BEP20" })).toEqual({
      kind: "REVIEW_MANUAL_CRYPTO",
      provider: "USDT_BEP20",
    });
  });

  it.each(["BINANCE_INTERNAL", "USDT_BEP20"])("does not reopen expired %s for manual approval", paymentMethod => {
    expect(orderAction({ paymentMethod, expiresAt: expiredAt }).kind).toBe("RECHECK_PROVIDER");
    expect(orderAction({ paymentMethod, orderPaymentStatus: "PAID", paymentStatus: "PAID" }).kind).toBe("BLOCKED");
  });

  it("uses the same active and expired policy for wallet top ups", () => {
    expect(adminWalletTopupRecoveryAction({
      status: "PENDING",
      paymentMethod: "JAGO_TRANSFER",
      expiresAt: activeExpiry,
      now,
    })).toEqual({ kind: "CONFIRM_ACTIVE", provider: "JAGO" });
    expect(adminWalletTopupRecoveryAction({
      status: "EXPIRED",
      paymentMethod: "DANA_RELAY",
      expiresAt: expiredAt,
      now,
    })).toEqual({ kind: "RECONCILE_EVENT", provider: "DANA" });
  });
});

describe("shared external IDR provider mapping", () => {
  it("keeps DANA and Jago method buckets isolated", () => {
    expect(orderPaymentMethodsForProvider("DANA")).toEqual([
      "DANA_RELAY",
      "WALLET_QRIS",
    ]);
    expect(orderPaymentMethodsForProvider("JAGO")).toEqual(["JAGO_TRANSFER"]);
    expect(orderPaymentMethodMatchesProvider("JAGO", "DANA_RELAY")).toBe(false);
    expect(walletTopupPaymentMethodForProvider("JAGO")).toBe("JAGO_TRANSFER");
  });
});

describe("admin return paths", () => {
  it("preserves internal admin pages and rejects external redirects", () => {
    expect(normalizeAdminReturnPath("/admin/orders/123?x=1#payment")).toBe(
      "/admin/orders/123?x=1#payment",
    );
    expect(normalizeAdminReturnPath("https://evil.example/admin")).toBe("/admin");
    expect(normalizeAdminReturnPath("//evil.example/admin")).toBe("/admin");
  });

  it("adds result state without dropping query parameters or anchors", () => {
    expect(adminResultReturnPath(
      "/admin/payments/jago?jp=2#jago-transfer-ledger",
      "notice",
      "payment-confirmed",
    )).toBe(
      "/admin/payments/jago?jp=2&notice=payment-confirmed#jago-transfer-ledger",
    );
  });

  it("builds bounded admin state links and clears a stale opposite result", () => {
    const returnTo = buildAdminReturnPath({
      pathname: "/admin/wallet",
      query: { page: 3, q: "@buyer", topupPage: 4 },
      fragment: "topup-history",
    });

    expect(returnTo).toBe(
      "/admin/wallet?page=3&q=%40buyer&topupPage=4#topup-history",
    );
    expect(adminResultReturnPath(
      `${returnTo.replace("?", "?error=old&")}`,
      "notice",
      "topup-confirmed",
    )).toBe(
      "/admin/wallet?page=3&q=%40buyer&topupPage=4&notice=topup-confirmed#topup-history",
    );
    expect(buildAdminReturnPath({
      pathname: "https://evil.example/admin",
      query: { page: 2 },
      fragment: "wallet-list",
    })).toBe("/admin?page=2#wallet-list");
  });
});
