import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { cancelSmsPoolCustomerOrderByAdmin } from "@/server/smspool/customer-orders";
import { adjustWalletBalance, applyWalletTransaction } from "@/server/wallet/ledger";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const chatIds: string[] = [];

databaseDescribe("SMSPool admin cancellation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SMSPOOL_API_KEY;
  });

  afterAll(async () => {
    await prisma.smsPoolCustomerOrder.deleteMany({
      where: { chatId: { in: chatIds } },
    });
    await prisma.walletTransaction.deleteMany({
      where: { walletChatId: { in: chatIds } },
    });
    await prisma.wallet.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.$disconnect();
  });

  it("cancels an active customer order and refunds its wallet exactly once", async () => {
    process.env.SMSPOOL_API_KEY = "k".repeat(32);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: 1, message: "Cancelled" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const chatId = `sms-admin-cancel-${randomUUID()}`;
    chatIds.push(chatId);
    await adjustWalletBalance({
      chatId,
      amount: 10_000,
      idempotencyKey: `sms-admin-seed:${chatId}`,
      actor: "integration-test",
    });
    await prisma.$transaction((tx) =>
      applyWalletTransaction(tx, {
        chatId,
        amount: -4_405,
        type: "SMS_PURCHASE_DEBIT",
        idempotencyKey: `sms-admin-debit:${chatId}`,
        actor: "CUSTOMER",
      }),
    );
    const order = await prisma.smsPoolCustomerOrder.create({
      data: {
        idempotencyKey: `sms-admin-order:${randomUUID()}`,
        chatId,
        providerOrderId: `SMS${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        countryId: 10,
        countryName: "Greece",
        serviceId: 39,
        serviceName: "OpenAI / ChatGPT",
        providerCostUsdCents: 13,
        sellPrice: 4_405,
        phoneNumber: "6955871841",
        providerStatus: "active",
        status: "ACTIVE",
      },
    });

    const cancelled = await cancelSmsPoolCustomerOrderByAdmin(
      order.id,
      "admin@example.com",
    );
    const retried = await cancelSmsPoolCustomerOrderByAdmin(
      order.providerOrderId!,
      "admin@example.com",
    );

    expect(cancelled).toMatchObject({ status: "REFUNDED", providerStatus: "cancelled" });
    expect(retried).toMatchObject({ status: "REFUNDED", providerStatus: "cancelled" });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { chatId } })).balance).toBe(10_000);
    expect(
      await prisma.walletTransaction.findMany({
        where: { idempotencyKey: `sms-refund:cancel:${order.id}` },
        select: { actor: true },
      }),
    ).toEqual([{ actor: "ADMIN:admin@example.com" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("returns null for an unknown local customer order", async () => {
    await expect(
      cancelSmsPoolCustomerOrderByAdmin("unknown-order", "admin@example.com"),
    ).resolves.toBeNull();
  });
});
