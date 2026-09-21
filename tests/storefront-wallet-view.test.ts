import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ tx: vi.fn(), wallet: vi.fn(), cursor: vi.fn(), rows: vi.fn(), settings: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { $transaction: f.tx } }));
vi.mock("@/server/payment/method-availability", () => ({ getPaymentMethodAvailability: f.settings }));
import { loadWebWallet } from "@/server/storefront/wallet";

describe("Web wallet projection (mocked storage)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    f.tx.mockImplementation(async action => action({ wallet: { findUnique: f.wallet }, walletTransaction: { findFirst: f.cursor, findMany: f.rows } }));
    f.wallet.mockResolvedValue({ balance: 15000 });
    f.settings.mockResolvedValue({ walletCheckoutEnabled: true, mixedWalletQrisEnabled: true, qrisDanaEnabled: true });
    f.rows.mockResolvedValue([]);
  });
  it("reads only the Web owner's wallet and never creates/top-ups a wallet", async () => {
    const result = await loadWebWallet("owner");
    expect(result.balance).toBe(15000);
    expect(f.wallet).toHaveBeenCalledWith({ where: { chatId: "web:owner" }, select: { balance: true } });
    expect(f.rows).toHaveBeenCalledWith(expect.objectContaining({ where: { walletChatId: "web:owner" }, take: 26 }));
    expect(f.tx).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
  });
  it("does not disclose a foreign invoice, operator note, or actor", async () => {
    f.rows.mockResolvedValue([{ id: "tx1", type: "ADMIN_CREDIT", amount: 15000, balanceAfter: 15000, createdAt: new Date("2026-09-15T00:00:00Z"), note: "private operator note", actor: "admin", order: { channel: "WEB", webCustomerId: "other", invoiceNumber: "foreign" } }]);
    const result = await loadWebWallet("owner");
    expect(result.transactions[0].invoiceNumber).toBeNull();
    expect(result.transactions[0]).not.toHaveProperty("note");
    expect(result.transactions[0]).not.toHaveProperty("actor");
  });
  it("rejects a pagination cursor from a different wallet", async () => {
    f.cursor.mockResolvedValue(null);
    await expect(loadWebWallet("owner", "foreign-cursor")).rejects.toThrow("Invalid wallet cursor");
    expect(f.cursor).toHaveBeenCalledWith({ where: { id: "foreign-cursor", walletChatId: "web:owner" }, select: { id: true } });
    expect(f.rows).not.toHaveBeenCalled();
  });
  it("bounds each page and uses the last displayed transaction as next cursor", async () => {
    f.rows.mockResolvedValue(Array.from({ length: 26 }, (_, i) => ({ id: `tx-${i}`, type: "PURCHASE_DEBIT", amount: -100, balanceAfter: 10000 - i * 100, createdAt: new Date(), order: { channel: "WEB", webCustomerId: "owner", invoiceNumber: "TGS-TEST" } })));
    const result = await loadWebWallet("owner");
    expect(result.transactions).toHaveLength(25); expect(result.nextCursor).toBe("tx-24");
    expect(result.transactions[0].invoiceNumber).toBe("TGS-TEST");
  });
  it("disables mixed wallet checkout when QRIS or wallet is disabled", async () => {
    f.settings.mockResolvedValue({ walletCheckoutEnabled: false, mixedWalletQrisEnabled: true, qrisDanaEnabled: true });
    expect((await loadWebWallet("owner")).mixedQrisEnabled).toBe(false);
    f.settings.mockResolvedValue({ walletCheckoutEnabled: true, mixedWalletQrisEnabled: true, qrisDanaEnabled: false });
    expect((await loadWebWallet("owner")).mixedQrisEnabled).toBe(false);
  });
});
