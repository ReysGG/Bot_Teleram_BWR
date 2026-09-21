import { describe, expect, it } from "vitest";
import {
  parseBinanceWebDetailResponse,
  parseBinanceWebHistoryResponse,
} from "@/server/payment/binance-web-contract";

const TRANSACTION_TIME = 1_788_628_053_000;

function historyRow(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "txn_107097889480042413",
    transactionTime: TRANSACTION_TIME,
    type: "INCOME",
    transactionType: "C2C",
    amount: "5.000001",
    currency: "USDT",
    status: "SUCCESS",
    counterpartyName: "Test buyer",
    transactionContext: { viaAccountValue: "Pay ID ending 123" },
    ...overrides,
  };
}

function envelope(transactionList: unknown[], hasMore = false) {
  return {
    code: "000000",
    success: true,
    data: { transactionList, hasMore },
  };
}

describe("Binance web transaction contract", () => {
  it("normalizes an incoming C2C row with exact micro-USDT precision", () => {
    const result = parseBinanceWebHistoryResponse(envelope([historyRow()], true));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.page.hasMore).toBe(true);
    expect(result.page.nextTransactionTime).toBe(BigInt(TRANSACTION_TIME));
    expect(result.page.transactions[0]).toMatchObject({
      providerTransactionId: "txn_107097889480042413",
      direction: "INCOME",
      transactionType: "C2C",
      providerStatus: "SUCCESS",
      currency: "USDT",
      amountMicros: 5_000_001n,
      counterpartyName: "Test buyer",
      viaAccountValue: "Pay ID ending 123",
    });
    expect(result.page.transactions[0].rawPayloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("skips outgoing rows instead of treating them as received money", () => {
    expect(parseBinanceWebHistoryResponse(envelope([
      historyRow({ type: "PAYOUT", amount: "5.000001" }),
    ]))).toMatchObject({
      status: "ok",
      page: { transactions: [], skippedCount: 1 },
    });
  });

  it("retains non-success incoming evidence for later state updates", () => {
    const result = parseBinanceWebHistoryResponse(envelope([
      historyRow({ status: undefined, transactionStatus: { status: "PROCESSING" } }),
    ]));
    expect(result).toMatchObject({
      status: "ok",
      page: { transactions: [{ providerStatus: "PROCESSING" }] },
    });
  });

  it("fails closed for malformed envelopes, timestamps, and amounts", () => {
    expect(parseBinanceWebHistoryResponse({ code: "000000", success: false, data: {} }))
      .toEqual({ status: "contract_unknown", detail: "INVALID_HISTORY_ENVELOPE" });
    expect(parseBinanceWebHistoryResponse(envelope([
      historyRow({ transactionTime: 123 }),
    ]))).toEqual({ status: "contract_unknown", detail: "INVALID_HISTORY_ROW" });
    expect(parseBinanceWebHistoryResponse(envelope([
      historyRow({ amount: "5.0000011" }),
    ]))).toEqual({ status: "contract_unknown", detail: "INVALID_HISTORY_ROW" });
  });

  it("requires a cursor when Binance reports another page", () => {
    expect(parseBinanceWebHistoryResponse(envelope([], true)))
      .toEqual({ status: "contract_unknown", detail: "MISSING_HISTORY_CURSOR" });
  });

  it("parses the detail Order ID and explicit receiver binding", () => {
    const result = parseBinanceWebDetailResponse({
      code: "000000",
      success: true,
      data: {
        transactionId: "txn_107097889480042413",
        orderId: "448515289526009856",
        receiverInfo: { binanceId: "567896636" },
        transactionAmount: { amount: "5.000001", currency: "USDT" },
        transactionTime: TRANSACTION_TIME,
      },
    });
    expect(result).toMatchObject({
      status: "ok",
      detail: {
        providerTransactionId: "txn_107097889480042413",
        providerOrderId: "448515289526009856",
        receiverBinanceId: "567896636",
        amountMicros: 5_000_001n,
        currency: "USDT",
      },
    });
  });

  it("does not invent an Order ID when detail shape changes", () => {
    expect(parseBinanceWebDetailResponse({
      code: "000000",
      success: true,
      data: { transactionId: "txn_1" },
    })).toEqual({ status: "contract_unknown", detail: "DETAIL_ORDER_ID_MISSING" });
  });
});
