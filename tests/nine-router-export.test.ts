import { describe, expect, it } from "vitest";
import {
  buildNineRouterBulkImport,
  nineRouterBulkFilename,
} from "@/server/stock/nine-router-export";

describe("9Router bulk delivery export", () => {
  it("creates the root array accepted by 9Router bulk import", () => {
    const output = JSON.parse(
      buildNineRouterBulkImport([
        {
          accessToken: "access-token-account-one-long-enough",
          refreshToken: "refresh-one",
          email: "one@example.test",
          provider: "codex",
          providerSpecificData: { chatgptAccountId: "account-one" },
        },
        {
          accessToken: "access-token-account-two-long-enough",
          refreshToken: "refresh-two",
          email: "two@example.test",
          provider: "codex",
          providerSpecificData: { chatgptAccountId: "account-two" },
        },
      ]).toString("utf8"),
    );

    expect(Array.isArray(output)).toBe(true);
    expect(output).toHaveLength(2);
    expect(output[0].accessToken).toBe("access-token-account-one-long-enough");
    expect(output[1].providerSpecificData.chatgptAccountId).toBe("account-two");
  });

  it("builds a safe recognizable download filename", () => {
    expect(nineRouterBulkFilename("TGS/20260802:ABC", 20)).toBe(
      "TGS-20260802-ABC-20-accounts.9router.json",
    );
  });
});
