import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => ({ purchase: vi.fn(), cancel: vi.fn() }));
vi.mock("@/server/smspool/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/smspool/client")>(),
  getSmsPoolServices: async () => [{ ID: 1, name: "Demo service", favourite: 1 }],
  getSmsPoolSuccessRates: async () => [{ country_id: 1, name: "Demo country", short_name: "US", success_rate: 99, price: 0.2, low_price: 0.2 }],
  purchaseSmsPoolNumber: provider.purchase, cancelSmsPoolOrder: provider.cancel,
}));
import { prisma } from "@/server/db/prisma";
import { purchaseSmsPoolForWebCustomer, purchaseSmsPoolForCustomer, cancelSmsPoolCustomerOrder } from "@/server/smspool/customer-orders";
import { requireWebSmsOrder, publicWebSmsOrder, webSmsOrders } from "@/server/storefront/sms";
const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const customerIds: string[] = [], chatIds: string[] = [];
async function fixture(balance = 20_000) {
  const customer = await prisma.webCustomer.create({ data: { contactLookupHash: randomUUID(), contactMasked: "de***@example.test", passwordHash: "synthetic-only", clerkUserId: `user_${randomUUID()}`, clerkIssuer: "https://clerk.example.test", clerkLinkedAt: new Date() } });
  customerIds.push(customer.id); const chatId = `web:${customer.id}`; chatIds.push(chatId);
  await prisma.wallet.create({ data: { chatId, balance } });
  return { customerId: customer.id, serviceId: 1, countryId: 1, expectedPrice: 3000, idempotencyKey: randomUUID() };
}
databaseDescribe("web SMS ownership and money invariants", () => {
  beforeEach(async () => {
    vi.clearAllMocks(); process.env.SMSPOOL_USD_TO_IDR_RATE = "10000"; process.env.SMSPOOL_SERVICE_FEE_IDR = "1000";
    provider.purchase.mockImplementation(async () => ({ success: 1, order_id: `demo-${randomUUID()}`, phonenumber: "2025550147", cc: "1", cost: "0.20", expiration: Math.floor(Date.now()/1000)+600 }));
    provider.cancel.mockResolvedValue({ success: 1 });
    await prisma.storeRuntimeSetting.upsert({ where: { id: "global" }, create: { id: "global", walletCheckoutEnabled: true, qrisDanaEnabled: false }, update: { maintenanceMode: false, walletCheckoutEnabled: true, qrisDanaEnabled: false } });
  });
  afterAll(async () => {
    await prisma.telegramNotification.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.smsPoolCustomerOrder.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.walletTransaction.deleteMany({ where: { walletChatId: { in: chatIds } } });
    await prisma.wallet.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.webCustomer.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.$disconnect();
  });
  it("charges once and reuses the same number for retried purchases", async () => {
    const input = await fixture(); const first = await purchaseSmsPoolForWebCustomer(input); const retry = await purchaseSmsPoolForWebCustomer(input);
    expect(first.id).toBe(retry.id); expect(first.status).toBe("ACTIVE"); expect(provider.purchase).toHaveBeenCalledOnce();
    expect((await prisma.wallet.findUniqueOrThrow({ where: { chatId: `web:${input.customerId}` } })).balance).toBe(17000);
    expect(await prisma.walletTransaction.count({ where: { walletChatId: `web:${input.customerId}`, type: "SMS_PURCHASE_DEBIT" } })).toBe(1);
  });
  it("deduplicates concurrent clicks before purchasing from the provider", async () => {
    const input = await fixture(); const [a,b] = await Promise.all([purchaseSmsPoolForWebCustomer(input), purchaseSmsPoolForWebCustomer(input)]);
    expect(a.id).toBe(b.id); expect(provider.purchase).toHaveBeenCalledOnce();
    expect((await prisma.wallet.findUniqueOrThrow({ where: { chatId: `web:${input.customerId}` } })).balance).toBe(17000);
  });
  it("rejects a changed quote and insufficient balance before provider purchase", async () => {
    await expect(purchaseSmsPoolForWebCustomer({ ...await fixture(), expectedPrice: 2999 })).rejects.toThrow("sms_price_changed");
    const poor = await fixture(1000); await expect(purchaseSmsPoolForWebCustomer(poor)).rejects.toThrow("Saldo wallet tidak mencukupi");
    expect(provider.purchase).not.toHaveBeenCalled();
    expect(await prisma.smsPoolCustomerOrder.count({ where: { chatId: `web:${poor.customerId}` } })).toBe(0);
  });
  it("respects checkout maintenance and the wallet switch", async () => {
    const input = await fixture();
    await prisma.storeRuntimeSetting.update({ where: { id: "global" }, data: { maintenanceMode: true } });
    await expect(purchaseSmsPoolForWebCustomer(input)).rejects.toThrow("sms_maintenance");
    await prisma.storeRuntimeSetting.update({ where: { id: "global" }, data: { maintenanceMode: false, walletCheckoutEnabled: false } });
    await expect(purchaseSmsPoolForWebCustomer(input)).rejects.toThrow("sms_wallet_disabled"); expect(provider.purchase).not.toHaveBeenCalled();
  });
  it("refunds provider failure to the same web wallet", async () => {
    const input = await fixture(); provider.purchase.mockRejectedValue(new Error("synthetic provider failure"));
    await expect(purchaseSmsPoolForWebCustomer(input)).rejects.toThrow();
    expect((await prisma.wallet.findUniqueOrThrow({ where: { chatId: `web:${input.customerId}` } })).balance).toBe(20000);
    const retry = await purchaseSmsPoolForWebCustomer(input); expect(retry.status).toBe("FAILED"); expect(provider.purchase).toHaveBeenCalledOnce();
  });
  it("protects other customers' numbers and strips internal provider fields", async () => {
    const owner = await fixture(), other = await fixture(); const order = await purchaseSmsPoolForWebCustomer(owner);
    await expect(requireWebSmsOrder(other.customerId, order.id)).rejects.toThrow("sms_order_missing");
    expect((await webSmsOrders(other.customerId)).orders).toEqual([]);
    const exposed = publicWebSmsOrder(order); expect(exposed).not.toHaveProperty("providerOrderId"); expect(exposed).not.toHaveProperty("chatId"); expect(exposed).not.toHaveProperty("providerCostUsdCents");
  });
  it("retains the private-Telegram guard and rejects repurposed requests", async () => {
    const input = await fixture(); await purchaseSmsPoolForWebCustomer(input);
    await expect(purchaseSmsPoolForWebCustomer({ ...input, serviceId: 2 })).rejects.toThrow("sms_request_conflict");
    await expect(purchaseSmsPoolForCustomer({ ...input, chatId: `web:${input.customerId}` })).rejects.toThrow("chat pribadi");
  });
  it("refunds a cancelled number once even when cancellation is retried", async () => {
    const input = await fixture(); const order = await purchaseSmsPoolForWebCustomer(input);
    await cancelSmsPoolCustomerOrder(order.chatId, order.id); await cancelSmsPoolCustomerOrder(order.chatId, order.id);
    expect(provider.cancel).toHaveBeenCalledOnce();
    expect((await prisma.wallet.findUniqueOrThrow({ where: { chatId: order.chatId } })).balance).toBe(20000);
    expect(await prisma.walletTransaction.count({ where: { walletChatId: order.chatId, type: "SMS_PURCHASE_REFUND" } })).toBe(1);
  });
});
