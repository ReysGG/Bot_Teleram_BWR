import { describe, expect, it } from "vitest";
import {
  deliveryAcknowledgedDedupeKey,
  deliveryFeedbackState,
  deliveryMissingReportDedupeKey,
} from "@/server/telegram/delivery-feedback";
import {
  accountRedeemVaultMissingDedupeKey,
  accountRedeemVaultMissingNotice,
} from "@/server/redeem/missing-report";

describe("buyer delivery feedback", () => {
  it("uses stable order-scoped audit keys", () => {
    expect(deliveryAcknowledgedDedupeKey("order-1")).toBe(
      "delivery-acknowledged:order-1",
    );
    expect(deliveryMissingReportDedupeKey("order-1")).toBe(
      "delivery-missing-report:order-1",
    );
  });

  it("prefers an active missing report over an earlier acknowledgement", () => {
    expect(
      deliveryFeedbackState([
        { kind: "DELIVERY_ACKNOWLEDGED", status: "SENT" },
        { kind: "DELIVERY_MISSING_REPORT", status: "MANUAL_REVIEW" },
      ]),
    ).toEqual({ acknowledged: false, missingReported: true });
    expect(
      deliveryFeedbackState([
        { kind: "DELIVERY_ACKNOWLEDGED", status: "SENT" },
        { kind: "DELIVERY_MISSING_REPORT", status: "SENT" },
      ]),
    ).toEqual({ acknowledged: true, missingReported: false });
  });
});

describe("Codex Free vault-missing report", () => {
  it("uses a stock-scoped dedupe key and safe user notice", () => {
    expect(accountRedeemVaultMissingDedupeKey("stock-1")).toBe(
      "account-redeem-vault-missing:stock-1",
    );
    const notice = accountRedeemVaultMissingNotice(2);
    expect(notice).toContain("2 akun");
    expect(notice).toContain("diteruskan ke admin");
    expect(notice).not.toContain("password:");
  });
});
