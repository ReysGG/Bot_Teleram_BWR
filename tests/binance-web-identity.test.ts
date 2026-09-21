import { describe, expect, it } from "vitest";
import { parseBinanceWebAccountIdentityResponse } from "@/server/payment/binance-web-contract";

describe("Binance web account identity contract", () => {
  it.each(["binanceId", "payId"])(
    "accepts a proven numeric identity from %s",
    (key) => {
      expect(parseBinanceWebAccountIdentityResponse({
        code: "000000",
        success: true,
        data: { [key]: "567896636" },
      })).toMatchObject({ status: "ok", binanceId: "567896636" });
    },
  );

  it("accepts a nested account identity but rejects malformed values", () => {
    expect(parseBinanceWebAccountIdentityResponse({
      code: "000000",
      success: true,
      data: { userInfo: { binanceId: 567896636 } },
    })).toMatchObject({ status: "ok", binanceId: "567896636" });
    expect(parseBinanceWebAccountIdentityResponse({
      code: "000000",
      success: true,
      data: { userId: "567896636" },
    })).toEqual({ status: "contract_unknown", detail: "ACCOUNT_IDENTITY_MISSING" });
  });
});
