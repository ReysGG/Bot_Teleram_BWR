import { beforeEach, expect, it, vi } from "vitest";
import { canTakeUnsoldStock } from "@/server/stock/admin-takeout-policy";

const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), login: vi.fn(), lock: vi.fn(), decrypt: vi.fn(), detect: vi.fn(), decryptLogin: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({ digitalStockItem: { findUnique: mocks.find, updateMany: mocks.update }, accountLoginCredential: { findUnique: mocks.login } }) } }));
vi.mock("@/server/checkout/inventory-lock", () => ({ lockInventoryAllocation: mocks.lock }));
vi.mock("@/server/stock/inventory", () => ({ decryptStockFile: mocks.decrypt }));
vi.mock("@/server/stock/credential", () => ({ detectStockContent: mocks.detect }));
vi.mock("@/server/redeem/account-login", () => ({ accountEmailHash: (email: string) => email, normalizeAccountEmail: (email: string) => email || null, decryptAccountLoginCredential: mocks.decryptLogin, serializeAccountLogin: () => "synthetic-login" }));
import { downloadAdminStock } from "@/server/stock/admin-takeout";

const item = { id: "stock", productId: "product", status: "BANNED", healthStatus: "BANNED", reservedOrderId: null, deliveredOrderId: null, orderItem: null, deliveryReceipt: null, archivedAt: null, originalFilename: "account.json" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue(item);
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.decrypt.mockImplementation(() => Buffer.from("synthetic-account"));
  mocks.detect.mockReturnValue({ kind: "K12", credential: { email: "user@example.test" } });
  mocks.login.mockResolvedValue({ emailHash: "user@example.test" });
  mocks.decryptLogin.mockReturnValue({ email: "user@example.test" });
});
it.each([
  { status: "RESERVED" }, { status: "DELIVERED" }, { reservedOrderId: "order" },
  { deliveredOrderId: "order" }, { orderItem: { id: "line" } }, { deliveryReceipt: { id: "receipt" } },
  { status: "AVAILABLE", healthStatus: "HEALTHY" },
])("protects owned or healthy stock: %j", (change) => {
  expect(canTakeUnsoldStock({ ...item, ...change })).toBe(false);
});
it("archives only after the account and matching email are prepared", async () => {
  const result = await downloadAdminStock("stock", "bundle", true);
  expect(result.file.subarray(0, 2).toString()).toBe("PK");
  expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), "product");
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.update.mock.calls[0][0].data.status).toBe("DISABLED");
});
it("leaves stock unchanged when email is absent", async () => {
  mocks.login.mockResolvedValue(null);
  await expect(downloadAdminStock("stock", "bundle", true)).rejects.toThrow("email-unmapped");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects mismatched vault email without archiving", async () => {
  mocks.decryptLogin.mockReturnValue({ email: "other@example.test" });
  await expect(downloadAdminStock("stock", "email", true)).rejects.toThrow("email-mismatch");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("rechecks eligibility after locking against concurrent checkout", async () => {
  mocks.find.mockResolvedValueOnce(item).mockResolvedValueOnce({ ...item, status: "RESERVED" });
  await expect(downloadAdminStock("stock", "account", true)).rejects.toThrow("stock-ineligible");
  expect(mocks.decrypt).not.toHaveBeenCalled();
});
it("supports download-only and retry from archived stock", async () => {
  await downloadAdminStock("stock", "account", false);
  expect(mocks.update).not.toHaveBeenCalled();
  mocks.find.mockResolvedValue({ ...item, status: "DISABLED", archivedAt: new Date() });
  await downloadAdminStock("stock", "email", true);
  expect(mocks.update).not.toHaveBeenCalled();
});
it("does not return the file if the conditional archive loses a race", async () => {
  mocks.update.mockResolvedValue({ count: 0 });
  await expect(downloadAdminStock("stock", "account", true)).rejects.toThrow("stock-changed");
});
