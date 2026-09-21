import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { lockOrderPaymentTransition } from "@/server/payment/locks";
import { decryptStockItem } from "@/server/stock/inventory";
import { detectStockContent } from "@/server/stock/credential";
import { accountEmailHash, normalizeAccountEmail, decryptAccountLoginCredential, serializeAccountLogin } from "@/server/redeem/account-login";
import { webCustomerChatId } from "./customer-access";

export class WebRedeemError extends Error {
  constructor(readonly code: "order_not_found" | "login_not_ready") { super(code); }
}

// Resolve only delivered units belonging to this authenticated Web customer.
// No uploaded token, caller-provided email or Telegram chat ID is accepted.
export async function webRedeem(input: { customerId: string; invoiceNumber: string; download?: boolean }) {
  return prisma.$transaction(async tx => {
    const owner = await tx.order.findFirst({
      where: { invoiceNumber: input.invoiceNumber.trim().toUpperCase(), channel: "WEB", webCustomerId: input.customerId },
      select: { id: true },
    });
    if (!owner) throw new WebRedeemError("order_not_found");
    await lockOrderPaymentTransition(tx, owner.id);
    const order = await tx.order.findUniqueOrThrow({ where: { id: owner.id }, include: {
      payment: true, items: true,
      deliveryReceipts: { where: { channel: "WEB", status: "SENT" }, include: { stockItem: true }, orderBy: { createdAt: "asc" } },
    } });
    const permitted = order.paymentStatus === "PAID" && order.payment?.status === "PAID" && ["FULFILLING", "COMPLETED"].includes(order.status);
    const units: Array<{ stockItemId: string; emailHash: string }> = [];
    if (permitted) for (const receipt of order.deliveryReceipts) {
      const stock = receipt.stockItem;
      if (receipt.chatId !== webCustomerChatId(input.customerId) || stock.status !== "DELIVERED" || stock.deliveredOrderId !== order.id ||
          !order.items.some(item => item.stockItemId === stock.id)) continue;
      const parsed = detectStockContent(decryptStockItem(stock));
      if (parsed.kind !== "K12") continue;
      const email = normalizeAccountEmail(parsed.credential.email ?? "");
      if (email) units.push({ stockItemId: stock.id, emailHash: accountEmailHash(email) });
    }
    const logins = units.length ? await tx.accountLoginCredential.findMany({ where: { emailHash: { in: units.map(unit => unit.emailHash) } } }) : [];
    const byHash = new Map(logins.map(login => [login.emailHash, login]));
    const matched = units.flatMap(unit => {
      const login = byHash.get(unit.emailHash);
      return login ? [{ unit, login }] : [];
    });
    const summary = { eligible: units.length, available: matched.length, missing: units.length - matched.length };
    if (!input.download) return { summary, content: null };
    if (!matched.length) throw new WebRedeemError("login_not_ready");
    const lines = matched.map(({ login }) => {
      const payload = decryptAccountLoginCredential(login);
      if (accountEmailHash(payload.email) !== login.emailHash) throw new Error("Login identity mismatch");
      return serializeAccountLogin(payload);
    });
    // Existing redeem ledger already supports opaque web:<customer> ownership.
    // SENT records a download response prepared, not browser receipt confirmation.
    await tx.accountRedeemBatch.create({ data: {
      id: "web-" + randomUUID(), chatId: webCustomerChatId(input.customerId),
      inputCount: units.length, matchedCount: matched.length, unmatchedCount: summary.missing, invalidCount: 0,
      status: "SENT", sentAt: new Date(),
      events: { create: matched.map(({ unit, login }, position) => ({
        chatId: webCustomerChatId(input.customerId), stockItemId: unit.stockItemId,
        orderId: order.id, loginCredentialId: login.id, position,
      })) },
    } });
    return { summary, content: Buffer.from(lines.join("\n") + "\n", "utf8") };
  });
}
