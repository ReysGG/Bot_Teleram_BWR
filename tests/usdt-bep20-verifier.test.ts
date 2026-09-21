import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(),
  updateMany: vi.fn(), confirm: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({ prisma: { usdtBep20Attempt: {
  findUnique: mocks.findUnique, findUniqueOrThrow: mocks.findUniqueOrThrow,
  findMany: mocks.findMany, updateMany: mocks.updateMany,
} } }));
vi.mock("@/server/payment/confirm-payment", () => ({ confirmOrderPayment: mocks.confirm }));

import {
  ERC20_TRANSFER_TOPIC, processPendingUsdtBep20Attempts, verifyUsdtBep20Attempt,
  type BscRpcClient,
} from "@/server/payment/usdt-bep20";

const recipient = `0x${"1".repeat(40)}`;
const token = `0x${"2".repeat(40)}`;
const txHash = `0x${"a".repeat(64)}`;
const createdAt = new Date("2026-09-05T01:00:00Z");
const expiresAt = new Date("2026-09-05T01:30:00Z");
const units = 5_000_001n * 10n ** 12n;
function attempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "usdt-1", orderId: "order-1", txHash, status: "VERIFYING",
    recipientAddressSnapshot: recipient, tokenContractSnapshot: token,
    expectedTokenUnits: units.toString(), requiredConfirmationsSnapshot: 12,
    confirmations: null, createdAt, expiresAt,
    verificationExpiresAt: new Date("2099-01-01"), ...overrides,
  };
}
function rpc(overrides: Record<string, unknown> = {}): BscRpcClient {
  const responses: Record<string, unknown> = {
    eth_chainId: "0x38",
    eth_getTransactionReceipt: {
      status: "0x1", blockNumber: "0x64",
      logs: [{ address: token, topics: [ERC20_TRANSFER_TOPIC, `0x${"0".repeat(64)}`, `0x${"0".repeat(24)}${recipient.slice(2)}`],
        data: `0x${units.toString(16).padStart(64, "0")}`, logIndex: "0x2" }],
    },
    eth_getBlockByNumber: { timestamp: `0x${Math.floor(new Date("2026-09-05T01:05:00Z").getTime() / 1000).toString(16)}` },
    eth_blockNumber: "0x6f", ...overrides,
  };
  return { request: vi.fn(async (method: string) => responses[method]) as BscRpcClient["request"] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(attempt());
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.confirm.mockResolvedValue({ paymentStatus: "PAID" });
});

describe("USDT BEP20 on-chain verification", () => {
  it("confirms only an exact Transfer on BSC with the invoice confirmation threshold", async () => {
    const client = rpc();
    await expect(verifyUsdtBep20Attempt({ attemptId: "usdt-1", rpcClient: client }))
      .resolves.toEqual({ outcome: "CONFIRMED", confirmations: 12 });
    expect(client.request).toHaveBeenCalledWith("eth_getTransactionReceipt", [txHash]);
    expect(mocks.confirm).toHaveBeenCalledWith({
      orderId: "order-1", verifiedBy: `usdt-bep20:${txHash}`, usdtBep20AttemptId: "usdt-1",
    });
  });

  it.each([
    ["another chain", { eth_chainId: "0x1" }],
    ["failed transfer", { eth_getTransactionReceipt: { status: "0x0" } }],
    ["missing receipt", { eth_getTransactionReceipt: null }],
    ["invalid block timestamp", { eth_getBlockByNumber: { timestamp: "0xffffffffffffffffffffffff" } }],
    ["late transfer", { eth_getBlockByNumber: { timestamp: `0x${Math.floor((expiresAt.getTime() + 1000) / 1000).toString(16)}` } }],
    ["stale RPC head", { eth_blockNumber: "0x63" }],
  ])("does not pay for %s", async (_label, overrides) => {
    expect((await verifyUsdtBep20Attempt({ attemptId: "usdt-1", rpcClient: rpc(overrides) })).outcome)
      .not.toBe("CONFIRMED");
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it.each(["token", "recipient", "amount", "duplicate log"])("does not pay for a mismatched %s", async (field) => {
    const client = rpc();
    const receipt = await client.request<{ status: string; blockNumber: string; logs: Array<{ address: string; topics: string[]; data: string; logIndex: string }> }>("eth_getTransactionReceipt", []);
    if (field === "token") receipt.logs[0].address = `0x${"3".repeat(40)}`;
    if (field === "recipient") receipt.logs[0].topics[2] = `0x${"0".repeat(24)}${"3".repeat(40)}`;
    if (field === "amount") receipt.logs[0].data = `0x${(units + 1n).toString(16).padStart(64, "0")}`;
    if (field === "duplicate log") receipt.logs.push({ ...receipt.logs[0], logIndex: "0x3" });
    await verifyUsdtBep20Attempt({ attemptId: "usdt-1", rpcClient: rpc({ eth_getTransactionReceipt: receipt }) });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("waits for confirmations without downgrading a concurrently confirmed payment", async () => {
    await expect(verifyUsdtBep20Attempt({ attemptId: "usdt-1", rpcClient: rpc({ eth_blockNumber: "0x65" }) }))
      .resolves.toEqual({ outcome: "PENDING_CONFIRMATIONS", confirmations: 2 });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "usdt-1", status: { in: ["VERIFYING", "PENDING_CONFIRMATIONS"] } },
    }));
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("does not overwrite terminal state when a stale RPC no longer finds the receipt", async () => {
    await verifyUsdtBep20Attempt({ attemptId: "usdt-1", rpcClient: rpc({ eth_getTransactionReceipt: null }) });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "usdt-1", status: { in: ["VERIFYING", "PENDING_CONFIRMATIONS"] } },
    }));
  });

  it("does not confirm after losing the verification state transition", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUniqueOrThrow.mockResolvedValue(attempt({ status: "EXPIRED" }));
    await verifyUsdtBep20Attempt({ attemptId: "usdt-1", rpcClient: rpc() });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("continues the batch when one verified order cannot yet be fulfilled", async () => {
    mocks.findMany.mockResolvedValue([{ id: "usdt-1" }, { id: "usdt-2" }]);
    mocks.findUnique.mockResolvedValueOnce(attempt({ status: "VERIFIED" }))
      .mockResolvedValueOnce(attempt({ id: "usdt-2", status: "CONFIRMED" }));
    mocks.confirm.mockRejectedValueOnce(new Error("Retryable fulfillment failure"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(processPendingUsdtBep20Attempts()).resolves.toMatchObject({
        checked: 2, results: [{ outcome: "CONFIRMED" }],
      });
    } finally { warn.mockRestore(); }
  });
});
