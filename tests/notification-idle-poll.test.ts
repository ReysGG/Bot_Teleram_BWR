import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), transaction: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: {
  telegramNotification: { findFirst: mocks.findFirst, findMany: mocks.findMany, updateMany: mocks.updateMany },
  $transaction: mocks.transaction,
} }));
import { processTelegramNotifications } from "@/server/telegram/delivery-worker";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.updateMany.mockResolvedValue({ count: 0 });
  mocks.findFirst.mockResolvedValue(null);
  mocks.transaction.mockResolvedValue(null);
});
it("does not acquire claim locks for empty polls while retaining recovery checks", async () => {
  const result = await processTelegramNotifications(75);
  expect(result.processed).toBe(0);
  expect(mocks.updateMany).toHaveBeenCalledOnce();
  expect(mocks.findMany).toHaveBeenCalledTimes(2);
  expect(mocks.findFirst).toHaveBeenCalledOnce();
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.findFirst.mock.invocationCallOrder[0]);
});
it("keeps all transactional slots when work may be ready", async () => {
  mocks.findFirst.mockResolvedValue({ id: "queued" });
  await processTelegramNotifications(75, 3);
  expect(mocks.transaction).toHaveBeenCalledTimes(3);
});
it("checks again on the next poll so newly queued work is not cached away", async () => {
  await processTelegramNotifications(75);
  mocks.findFirst.mockResolvedValue({ id: "new" });
  await processTelegramNotifications(75);
  expect(mocks.transaction).toHaveBeenCalledTimes(3);
});
