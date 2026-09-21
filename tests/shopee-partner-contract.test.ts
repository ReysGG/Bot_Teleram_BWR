import { describe, expect, it } from "vitest";
import {
  parseShopeeIdrAmount,
  parseShopeePartnerTransactionResponse,
  shopeePartnerAccountFingerprint,
} from "@/server/payment/shopee-partner-contract";

function row(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "107097889480042413",
    externalTransactionId: "ATAnrJca34GVm",
    createTime: 1788628053,
    storeId: 23556014,
    service: 1,
    amount: "85.039",
    status: 3,
    transactionType: 1,
    merchantId: 22669496,
    ...overrides,
  };
}

describe("Shopee Partner transaction response contract", () => {
  it("parses Indonesian grouped IDR amounts exactly", () => {
    expect(parseShopeeIdrAmount("85.039")).toBe(85039);
    expect(parseShopeeIdrAmount("18.239.113")).toBe(18239113);
    expect(parseShopeeIdrAmount("85039")).toBe(85039);
    expect(parseShopeeIdrAmount("85.039,00")).toBeNull();
  });

  it("normalizes the supplied completed incoming row and hashes it locally", () => {
    const result = parseShopeePartnerTransactionResponse({
      code: 0,
      data: { list: [row()], total: "375", next_position: "mss:2" },
      msg: "",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.page.nextPosition).toBe("mss:2");
    expect(result.page.account).toEqual({
      merchantId: "22669496",
      storeId: "23556014",
      fingerprint: shopeePartnerAccountFingerprint("22669496", "23556014"),
    });
    expect(result.page.transactions[0]).toMatchObject({
      externalTransactionId: "107097889480042413",
      merchantExternalTransactionId: "ATAnrJca34GVm",
      amount: 85039,
      service: 1,
      transactionType: 1,
      statusCode: 3,
    });
    expect(result.page.transactions[0].rawPayloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("skips non-completed or non-incoming rows without treating them as paid", () => {
    const result = parseShopeePartnerTransactionResponse({
      code: 0,
      data: {
        list: [
          row({ status: 2 }),
          row({ transactionId: "107097889480042414", transactionType: 2 }),
          row({ transactionId: "107097889480042415", status: 0, service: 0 }),
        ],
      },
    });
    expect(result).toMatchObject({ status: "ok", page: { transactions: [], skippedCount: 3 } });
  });

  it("rejects mixed merchant/store identities and changed session identity", () => {
    expect(parseShopeePartnerTransactionResponse({
      code: 0,
      data: { list: [row(), row({ transactionId: "107097889480042414", storeId: 99999999 })] },
    })).toEqual({ status: "account_mismatch", detail: "MULTIPLE_MERCHANT_IDENTITIES" });
    expect(parseShopeePartnerTransactionResponse({
      code: 0,
      data: { list: [row()] },
    }, {
      merchantId: "22669496",
      storeId: "99999999",
      fingerprint: shopeePartnerAccountFingerprint("22669496", "99999999"),
    })).toEqual({ status: "account_mismatch", detail: "SESSION_MERCHANT_IDENTITY_CHANGED" });
  });

  it("accepts an empty page only after the session identity is known", () => {
    const expectedAccount = {
      merchantId: "22669496",
      storeId: "23556014",
      fingerprint: shopeePartnerAccountFingerprint("22669496", "23556014"),
    };
    expect(parseShopeePartnerTransactionResponse({ code: 0, data: {} }, expectedAccount))
      .toEqual({ status: "ok", page: { account: expectedAccount, transactions: [], nextPosition: "", skippedCount: 0 } });
    expect(parseShopeePartnerTransactionResponse({ code: 0, data: { list: null } }, expectedAccount))
      .toEqual({ status: "ok", page: { account: expectedAccount, transactions: [], nextPosition: "", skippedCount: 0 } });
  });

  it("fails closed for a nonzero response code, malformed row, or empty identity-free page", () => {
    expect(parseShopeePartnerTransactionResponse({ code: 7, data: { list: [] } }))
      .toEqual({ status: "contract_unknown", detail: "INVALID_TRANSACTION_LIST_ENVELOPE" });
    expect(parseShopeePartnerTransactionResponse({ code: 0, data: { list: [{ ...row(), amount: "not-money" }] } }))
      .toEqual({ status: "contract_unknown", detail: "INVALID_TRANSACTION_ROW" });
    expect(parseShopeePartnerTransactionResponse({ code: 0, data: {} }))
      .toEqual({ status: "contract_unknown", detail: "ACCOUNT_IDENTITY_NOT_FOUND" });
    expect(parseShopeePartnerTransactionResponse({ code: 0, data: { list: {} } }))
      .toEqual({ status: "contract_unknown", detail: "INVALID_TRANSACTION_LIST_ENVELOPE" });
  });
});
