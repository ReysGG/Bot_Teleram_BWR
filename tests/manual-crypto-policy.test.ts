import { expect, it } from "vitest";
import { validateManualCryptoApproval } from "@/server/payment/manual-crypto-policy";
const reason = "Checked receipt in recipient account";
it("requires an explicit admin-only approval with a valid transaction reference", () => {
  const input = { reason, reference: "1234567890123456789" };
  expect(validateManualCryptoApproval("BINANCE_INTERNAL", "admin:owner@example.test", input)).toEqual(input);
  expect(() => validateManualCryptoApproval("BINANCE_INTERNAL", "worker", input)).toThrow("manual_approval_not_allowed");
  expect(() => validateManualCryptoApproval("WALLET", "admin:owner", input)).toThrow("manual_approval_not_allowed");
  expect(() => validateManualCryptoApproval("BINANCE_INTERNAL", "admin:owner", { ...input, reason: "ok" })).toThrow("manual_approval_reason_required");
});
it("requires and normalizes a full BEP20 hash", () => {
  const input = { reason, reference: "0x" + "A".repeat(64) };
  expect(validateManualCryptoApproval("USDT_BEP20", "admin:owner", input)?.reference).toBe(input.reference.toLowerCase());
  expect(() => validateManualCryptoApproval("USDT_BEP20", "admin:owner", { reason, reference: "123456" })).toThrow("manual_approval_reference_invalid");
});
it("keeps the automatic path unchanged when no manual evidence is supplied", () => {
  expect(validateManualCryptoApproval("BINANCE_INTERNAL", "worker")).toBeUndefined();
});
