import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { deliveredStockState } from "@/server/telegram/delivery-worker";
import { decryptStockFile } from "@/server/stock/inventory";
import { lockOrderPaymentTransition } from "@/server/payment/locks";
import { queueWebSuccessAnnouncement } from "@/server/storefront/success-announcement";
import { webCustomerChatId } from "./customer-access";
import { buildWebDeliveryBundle } from "./web-delivery-bundle";

export class WebDeliveryError extends Error {
  constructor(readonly code: "NOT_FOUND" | "NOT_READY" | "TOO_LARGE") { super(code); this.name = "WebDeliveryError"; }
}
type Receipt = Prisma.SentDeliveryGetPayload<{ include: { stockItem: true } }>;

async function recordDownloads(tx: Prisma.TransactionClient, orderId: string, receipts: Receipt[]) {
  const now = new Date();
  const ready = receipts.filter(receipt => receipt.status === "READY");
  const sent = receipts.filter(receipt => receipt.status === "SENT");
  if (ready.length) {
    const accepted = await tx.sentDelivery.updateMany({
      where: { id: { in: ready.map(row => row.id) }, orderId, channel: "WEB", status: "READY" },
      data: { status: "SENT", sentAt: now, downloadCount: { increment: 1 }, lastDownloadedAt: now, lastError: null },
    });
    if (accepted.count !== ready.length) throw new Error("Web delivery changed during download");
    const stock = await tx.digitalStockItem.updateMany({
      where: { id: { in: ready.map(row => row.stockItemId) }, status: "RESERVED", reservedOrderId: orderId },
      data: deliveredStockState(orderId, now),
    });
    if (stock.count !== ready.length) throw new Error("Web delivery stock changed during download");
  }
  if (sent.length) await tx.sentDelivery.updateMany({
    where: { id: { in: sent.map(row => row.id) }, orderId, channel: "WEB", status: "SENT" },
    data: { downloadCount: { increment: 1 }, lastDownloadedAt: now },
  });
  if (ready.length && await tx.sentDelivery.count({ where: { orderId, channel: "WEB", status: { not: "SENT" } } }) === 0) {
    const completed = await tx.order.updateMany({ where: { id: orderId, channel: "WEB", status: "FULFILLING", paymentStatus: "PAID" }, data: { status: "COMPLETED", completedAt: now } });
    if (completed.count === 1) await queueWebSuccessAnnouncement(tx, orderId);
  }
}

async function download(input: { customerId: string; invoiceNumber: string; receiptId?: string }) {
  let output: Buffer | undefined;
  try {
    return await prisma.$transaction(async tx => {
      const owner = await tx.order.findFirst({ where: { invoiceNumber: input.invoiceNumber.trim().toUpperCase(), webCustomerId: input.customerId, channel: "WEB" }, select: { id: true } });
      if (!owner) throw new WebDeliveryError("NOT_FOUND");
      await lockOrderPaymentTransition(tx, owner.id);
      const order = await tx.order.findUniqueOrThrow({ where: { id: owner.id }, select: {
        id: true, invoiceNumber: true, status: true, paymentStatus: true,
        payment: { select: { status: true } }, items: { select: { stockItemId: true } },
      } });
      if (!input.receiptId && order.items.length > 100) throw new WebDeliveryError("TOO_LARGE");
      const receipts = await tx.sentDelivery.findMany({
        where: { orderId: order.id, channel: "WEB", ...(input.receiptId ? { id: input.receiptId } : {}) },
        include: { stockItem: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      if (!receipts.length) throw new WebDeliveryError(input.receiptId ? "NOT_FOUND" : "NOT_READY");
      const allocated = new Set(order.items.map(item => item.stockItemId));
      if (order.paymentStatus !== "PAID" || order.payment?.status !== "PAID" || !["FULFILLING", "COMPLETED"].includes(order.status) ||
          (!input.receiptId && receipts.length !== order.items.length) || receipts.some(receipt =>
            receipt.chatId !== webCustomerChatId(input.customerId) || !allocated.has(receipt.stockItemId) ||
            !["READY", "SENT"].includes(receipt.status) ||
            (receipt.status === "READY" ? receipt.stockItem.status !== "RESERVED" || receipt.stockItem.reservedOrderId !== order.id
              : receipt.stockItem.status !== "DELIVERED" || receipt.stockItem.deliveredOrderId !== order.id))) throw new WebDeliveryError("NOT_READY");
      const files: Array<{ filename: string; content: Buffer }> = [];
      try {
        for (const receipt of receipts) files.push({ filename: receipt.stockItem.originalFilename, content: decryptStockFile(receipt.stockItem) });
        let result: { filename: string; content: Buffer };
        try { result = input.receiptId ? files[0] : buildWebDeliveryBundle(order.invoiceNumber, files); }
        catch (error) { if (error instanceof RangeError) throw new WebDeliveryError("TOO_LARGE"); throw error; }
        output = result.content;
        await recordDownloads(tx, order.id, receipts);
        return result;
      } finally { for (const file of files) if (file.content !== output) file.content.fill(0); }
    }, { timeout: 15000 });
  } catch (error) { output?.fill(0); throw error; }
}
export function downloadWebDelivery(input: { customerId: string; invoiceNumber: string; receiptId: string }) { return download(input); }
export function downloadWebDeliveryBundle(input: { customerId: string; invoiceNumber: string }) { return download(input); }
