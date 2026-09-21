import { describe, expect, it } from "vitest";
import {
  normalizeReferralCode,
  referralLink,
  validateReferralCode,
} from "@/server/referral/service";

describe("referral codes", () => {
  it("normalizes deep-link payloads and builds Telegram links", () => {
    expect(normalizeReferralCode(" ref_David_88 ")).toBe("DAVID_88");
    expect(validateReferralCode("david88")).toBe("DAVID88");
    expect(referralLink("DAVID88")).toContain("?start=ref_DAVID88");
  });

  it("rejects unsafe or oversized codes", () => {
    expect(() => validateReferralCode("ab")).toThrow();
    expect(() => validateReferralCode("kode-referral")).toThrow();
    expect(() => validateReferralCode("x".repeat(21))).toThrow();
  });
});
