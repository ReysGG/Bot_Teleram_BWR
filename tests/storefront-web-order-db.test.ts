import { webRedeem } from "@/server/storefront/web-redeem";
import { importAccountLoginFiles, accountEmailHash } from "@/server/redeem/account-login";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createWebCheckout } from "@/server/storefront/checkout";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { getOrCreateWebCustomer, WebCustomerAccessError } from "@/server/storefront/customer-access";
import { downloadWebProductAttachment } from "@/server/storefront/web-attachment";
import { downloadWebDelivery, downloadWebDeliveryBundle } from "@/server/storefront/web-delivery";
import { getWebCustomerOrder, pageWebCustomerOrders } from "@/server/storefront/orders";
import { prisma } from "@/server/db/prisma";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { prepareProductAttachment } from "@/server/products/attachment";
import { importStockFiles } from "@/server/stock/inventory";
import { cancelWebOrder } from "@/server/storefront/payment-actions";
import { creditExpiredOrderPaymentToWallet } from "@/server/wallet/expired-order-credit";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const loginHashes: string[] = [];
const productIds: string[] = [];
const orderIds: string[] = [];
const customerIds: string[] = [];
const chatIds: string[] = [];

databaseDescribe("web storefront order and delivery database flow", () => {
  it("credits a verified expired Web payment once without needing a Telegram recipient", async () => {
    const customer = await prisma.webCustomer.create({ data: { contactLookupHash: randomUUID(), contactMasked: "te***@example.test", passwordHash: "disposable-only" } });
    customerIds.push(customer.id);
    const chatId = `web:${customer.id}`;
    chatIds.push(chatId);
    const product = await prisma.product.create({ data: { slug: `web-expired-${randomUUID()}`, name: "Disposable mail", description: "Test only", price: 500 } });
    productIds.push(product.id);
    const order = await prisma.order.create({ data: {
      idempotencyKey: `web-expired:${randomUUID()}`, invoiceNumber: `WEB-EXPIRED-${randomUUID()}`,
      channel: "WEB", webCustomerId: customer.id, chatId, subtotal: 500, serviceFee: 67, grandTotal: 567,
      status: "EXPIRED", paymentStatus: "EXPIRED", expiresAt: new Date(Date.now() - 60_000),
      items: { create: { productId: product.id, productNameSnapshot: product.name, unitPrice: 500 } },
      payment: { create: { invoiceNumber: `PAY-${randomUUID()}`, method: "DANA_RELAY", billedAmount: 567, uniqueCode: 67, status: "EXPIRED", expiresAt: new Date(Date.now() - 60_000) } },
    } });
    orderIds.push(order.id);
    // This command represents explicit operator-approved payment evidence, not expiry alone.
    expect((await creditExpiredOrderPaymentToWallet({ orderId: order.id, adminEmail: "review@example.test" })).credited).toBe(true);
    expect((await creditExpiredOrderPaymentToWallet({ orderId: order.id, adminEmail: "review@example.test" })).credited).toBe(false);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { chatId } })).balance).toBe(500);
    expect(await prisma.walletTransaction.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.telegramNotification.count({ where: { orderId: order.id } })).toBe(0);
    expect(await prisma.sentDelivery.count({ where: { orderId: order.id } })).toBe(0);
  });
  it("retrieves only an owner's delivered Codex logins with partial and repeat downloads", async () => {
    const customer = await prisma.webCustomer.create({ data: { contactLookupHash: randomUUID(), contactMasked: "te***@example.test", passwordHash: "disposable-only" } });
    customerIds.push(customer.id); chatIds.push(`web:${customer.id}`);
    const product = await prisma.product.create({ data: { slug: `login-${randomUUID()}`, name: "Codex test", description: "Fixture", price: 500 } });
    productIds.push(product.id);
    const email = `login-${randomUUID()}@example.test`;
    const missingEmail = `missing-${randomUUID()}@example.test`;
    await importStockFiles({ productId: product.id, files: [email, missingEmail].map((mail, index) => ({ filename: `login-${index}.json`, content: Buffer.from(JSON.stringify({ email: mail, accessToken: "fixture-access-" + randomUUID() })) })) });
    const stocks = await prisma.digitalStockItem.findMany({ where: { productId: product.id } });
    expect(stocks).toHaveLength(2);
    const order = await prisma.order.create({ data: {
      idempotencyKey: randomUUID(), invoiceNumber: `LOGIN-${randomUUID()}`.toUpperCase(), channel: "WEB", webCustomerId: customer.id, chatId: `web:${customer.id}`,
      subtotal: 1000, serviceFee: 0, grandTotal: 1000, status: "PENDING_PAYMENT", paymentStatus: "PENDING", expiresAt: new Date(Date.now()+60000),
      items: { create: stocks.map(stock => ({ productId: product.id, productNameSnapshot: product.name, unitPrice: 500, stockItemId: stock.id })) },
      payment: { create: { invoiceNumber: `P-${randomUUID()}`, method: "DANA_RELAY", billedAmount: 1000, status: "PENDING", expiresAt: new Date(Date.now()+60000) } },
    } });
    orderIds.push(order.id);
    const input = { customerId: customer.id, invoiceNumber: order.invoiceNumber };
    await expect(webRedeem({ ...input, download: true })).rejects.toMatchObject({ code: "login_not_ready" });
    await expect(webRedeem({ ...input, customerId: "someone-else" })).rejects.toMatchObject({ code: "order_not_found" });
    await prisma.order.update({ where: { id: order.id }, data: { status: "FULFILLING", paymentStatus: "PAID", payment: { update: { status: "PAID" } } } });
    await prisma.digitalStockItem.updateMany({ where: { productId: product.id }, data: { status: "DELIVERED", deliveredOrderId: order.id, deliveredAt: new Date() } });
    await prisma.sentDelivery.createMany({ data: stocks.map(stock => ({ dedupeKey: `login:${stock.id}`, orderId: order.id, stockItemId: stock.id, chatId: `web:${customer.id}`, channel: "WEB", status: "SENT", sentAt: new Date() })) });
    loginHashes.push(accountEmailHash(email));
    const line = `${email}----fixture-password----fixture-client-id----fixture-token-${randomUUID()}`;
    await importAccountLoginFiles({ files: [{ filename: "logins.txt", content: Buffer.from(line) }], importedBy: "isolated-test" });
    const before = await prisma.digitalStockItem.findMany({ where: { productId: product.id } });
    expect((await webRedeem(input)).summary).toEqual({ eligible: 2, available: 1, missing: 1 });
    const downloads = await Promise.all([webRedeem({ ...input, download: true }), webRedeem({ ...input, download: true })]);
    for (const result of downloads) expect(result.content?.toString()).toBe(line + "\n");
    expect(await prisma.digitalStockItem.findMany({ where: { productId: product.id } })).toEqual(before);
    expect(await prisma.accountRedeemEvent.count({ where: { orderId: order.id } })).toBe(2);
    expect(await prisma.telegramNotification.count({ where: { orderId: order.id } })).toBe(0);
    await prisma.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
    await expect(webRedeem({ ...input, download: true })).rejects.toMatchObject({ code: "login_not_ready" });
  });
  it("paginates only the owner's full order history with server-side search and status", async () => {
    const customer = await prisma.webCustomer.create({ data: { contactLookupHash: randomUUID(), contactMasked: "pa***@example.test", passwordHash: "fixture" } });
    customerIds.push(customer.id); chatIds.push(`web:${customer.id}`);
    const prefix = `PAGES-${randomUUID()}`.toUpperCase();
    const rows = Array.from({ length: 23 }, (_, index) => ({ id: randomUUID(), invoiceNumber: `${prefix}-${index}`, idempotencyKey: randomUUID(), channel: "WEB" as const, webCustomerId: customer.id, chatId: `web:${customer.id}`, subtotal: 500, serviceFee: 0, grandTotal: 500, status: index < 11 ? "PENDING_PAYMENT" as const : "EXPIRED" as const, paymentStatus: index < 11 ? "PENDING" as const : "EXPIRED" as const, expiresAt: new Date(), createdAt: new Date(Date.now() - index * 1000) }));
    await prisma.order.createMany({ data: rows }); orderIds.push(...rows.map(row => row.id));
    const first = await pageWebCustomerOrders(customer.id, { page: "1" });
    const second = await pageWebCustomerOrders(customer.id, { page: "2" });
    const last = await pageWebCustomerOrders(customer.id, { page: "999999" });
    expect(first.orders).toHaveLength(10); expect(second.orders).toHaveLength(10); expect(last.orders).toHaveLength(3);
    expect(new Set([...first.orders, ...second.orders, ...last.orders].map(row => row.id)).size).toBe(23);
    expect(first.pagination).toMatchObject({ totalOrders: 23, pendingCount: 11, totalPages: 3 });
    expect((await pageWebCustomerOrders(customer.id, { status: "expired", page: "2" })).orders).toHaveLength(2);
    expect((await pageWebCustomerOrders(customer.id, { q: `${prefix}-22` })).orders[0]?.id).toBe(rows[22].id);
    expect((await pageWebCustomerOrders("other-owner", { q: prefix })).pagination.total).toBe(0);
  });
  it("atomically merges owned paid deliveries and remains safe with simultaneous single downloads", async () => {
    const previousChannel = process.env.TELEGRAM_SUCCESS_CHANNEL_ID;
    process.env.TELEGRAM_SUCCESS_CHANNEL_ID = "-100000000123";
    try {
      const product = await prisma.product.create({ data: { slug: `bundle-${randomUUID()}`, name: "Bundle fixture", description: "Synthetic", price: 500 } });
      productIds.push(product.id);
      await importStockFiles({ productId: product.id, files: [{ filename: "a.txt", content: Buffer.from("first----fixture") }, { filename: "b.txt", content: Buffer.from("second----fixture") }] });
      const email = `bundle-${randomUUID()}@example.test`; const password = "FixturePassword123";
      const checkout = await createWebCheckout({ email, password, productId: product.id, quantity: 2, paymentMethod: "DANA", idempotencyKey: randomUUID() });
      orderIds.push(checkout.order.id);
      const customer = (await getOrCreateWebCustomer({ email, password })).customer;
      customerIds.push(customer.id); chatIds.push(`web:${customer.id}`);
      const input = { customerId: customer.id, invoiceNumber: checkout.order.invoiceNumber };
      await expect(downloadWebDeliveryBundle(input)).rejects.toMatchObject({ code: "NOT_READY" });
      await confirmOrderPayment({ orderId: checkout.order.id, verifiedBy: "isolated-bundle-test" });
      await expect(downloadWebDeliveryBundle({ ...input, customerId: "another-owner" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      const receipts = await prisma.sentDelivery.findMany({ where: { orderId: checkout.order.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      // A corrupt second file must not finalize any receipt or stock.
      const saved = await prisma.digitalStockItem.findUniqueOrThrow({ where: { id: receipts[1].stockItemId } });
      await prisma.digitalStockItem.update({ where: { id: saved.id }, data: { encryptedPayload: "invalid-ciphertext" } });
      await expect(downloadWebDeliveryBundle(input)).rejects.toThrow();
      expect(await prisma.sentDelivery.count({ where: { orderId: checkout.order.id, status: "READY" } })).toBe(2);
      expect(await prisma.digitalStockItem.count({ where: { productId: product.id, status: "RESERVED" } })).toBe(2);
      await prisma.digitalStockItem.update({ where: { id: saved.id }, data: { encryptedPayload: saved.encryptedPayload } });
      const [bundle] = await Promise.all([downloadWebDeliveryBundle(input), downloadWebDelivery({ ...input, receiptId: receipts[0].id })]);
      expect(bundle.filename.endsWith(".txt")).toBe(true);
      expect(bundle.content.toString().trim().split("\n").sort()).toEqual(["first----fixture", "second----fixture"]);
      const repeated = await downloadWebDeliveryBundle(input);
      expect(repeated.content.equals(bundle.content)).toBe(true);
      expect(await prisma.digitalStockItem.count({ where: { productId: product.id, status: "DELIVERED" } })).toBe(2);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: checkout.order.id } })).status).toBe("COMPLETED");
      expect(await prisma.telegramNotification.count({ where: { orderId: checkout.order.id, kind: "SUCCESS_CHANNEL" } })).toBe(1);
    } finally { if (previousChannel === undefined) delete process.env.TELEGRAM_SUCCESS_CHANNEL_ID; else process.env.TELEGRAM_SUCCESS_CHANNEL_ID = previousChannel; }
  }, 30000);
  afterAll(async () => {
    await prisma.accountRedeemEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.accountRedeemBatch.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.accountLoginCredential.deleteMany({ where: { emailHash: { in: loginHashes } } });
    await prisma.webCustomerSession.deleteMany({ where: { webCustomerId: { in: customerIds } } });
    await prisma.sentDelivery.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.telegramNotification.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.bridgePaymentEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.bridgePaymentClaim.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.qrisInvoiceAttempt.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.walletTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.digitalStockItem.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.wallet.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.webCustomer.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.$disconnect();
  });

  it("keeps web delivery out of Telegram and serves the same stock on repeated download", async () => {
    const product = await prisma.product.create({
      data: {
        slug: `web-order-${randomUUID()}`,
        name: "Web delivery integration product",
        description: "Disposable web checkout integration product",
        price: 7_500,
      },
    });
    productIds.push(product.id);
    await importStockFiles({
      productId: product.id,
      files: [{
        filename: "web-delivery.txt",
        content: Buffer.from("web-delivery-secret-" + randomUUID(), "utf8"),
      }],
    });

    const email = `web-${randomUUID()}@example.com`;
    const password = "StrongLocalPassword123";
    const checkout = await createWebCheckout({
      email,
      password,
      productId: product.id,
      quantity: 1,
      paymentMethod: "DANA",
      idempotencyKey: `web-checkout-${randomUUID()}`,
    });
    orderIds.push(checkout.order.id);
    const customer = (await getOrCreateWebCustomer({ email, password })).customer;
    customerIds.push(customer.id);
    chatIds.push(`web:${customer.id}`);

    const created = await prisma.order.findUniqueOrThrow({ where: { id: checkout.order.id } });
    expect(created).toMatchObject({ channel: "WEB", webCustomerId: customer.id, status: "PENDING_PAYMENT" });
    await confirmOrderPayment({ orderId: created.id, verifiedBy: "integration-test" });
    expect(await prisma.telegramNotification.count({ where: { orderId: created.id } })).toBe(0);
    const receipt = await prisma.sentDelivery.findFirstOrThrow({ where: { orderId: created.id } });
    expect(receipt).toMatchObject({ channel: "WEB", status: "READY" });

    const first = await downloadWebDelivery({ customerId: customer.id, invoiceNumber: created.invoiceNumber, receiptId: receipt.id });
    const firstContent = first.content.toString("utf8");
    const second = await downloadWebDelivery({ customerId: customer.id, invoiceNumber: created.invoiceNumber, receiptId: receipt.id });
    expect(second.content.toString("utf8")).toBe(firstContent);
    first.content.fill(0);
    second.content.fill(0);

    const completed = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
    const delivered = await prisma.sentDelivery.findUniqueOrThrow({ where: { id: receipt.id } });
    const stock = await prisma.digitalStockItem.findUniqueOrThrow({ where: { id: receipt.stockItemId } });
    expect(completed.status).toBe("COMPLETED");
    expect(delivered).toMatchObject({ channel: "WEB", status: "SENT", downloadCount: 2 });
    expect(stock).toMatchObject({ status: "DELIVERED", deliveredOrderId: created.id });

    const other = await getOrCreateWebCustomer({ email: `other-${randomUUID()}@example.com`, password });
    customerIds.push(other.customer.id);
    chatIds.push(`web:${other.customer.id}`);
    expect(await getWebCustomerOrder(other.customer.id, checkout.order.invoiceNumber)).toBeNull();
    await expect(downloadWebDelivery({ customerId: other.customer.id, invoiceNumber: created.invoiceNumber, receiptId: receipt.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getOrCreateWebCustomer({ email, password: "DifferentPassword123" })).rejects.toBeInstanceOf(WebCustomerAccessError);
  }, 30_000);

  it("allows only one channel to claim the last stock and refunds the loser wallet", async () => {
    const product = await prisma.product.create({
      data: {
        slug: `web-telegram-race-${randomUUID()}`,
        name: "Web and Telegram race product",
        description: "Disposable cross-channel contention product",
        price: 8_500,
        preorderEnabled: true,
        preorderEtaText: "1 hari",
        preorderLimit: 5,
      },
    });
    productIds.push(product.id);
    await importStockFiles({
      productId: product.id,
      files: [{ filename: "last-stock.txt", content: Buffer.from("last-stock-" + randomUUID()) }],
    });

    const password = "CrossChannelPassword123";
    const email = `race-${randomUUID()}@example.com`;
    const webCheckout = await createWebCheckout({
      email,
      password,
      productId: product.id,
      quantity: 1,
      paymentMethod: "DANA",
      idempotencyKey: `web-race-${randomUUID()}`,
    });
    const webCustomer = (await getOrCreateWebCustomer({ email, password })).customer;
    customerIds.push(webCustomer.id);
    chatIds.push(`web:${webCustomer.id}`);
    const telegramChatId = String(900_000_000 + Math.floor(Math.random() * 90_000_000));
    chatIds.push(telegramChatId);
    const telegramOrder = await createDigitalOrder({
      chatId: telegramChatId,
      productId: product.id,
      idempotencyKey: `telegram-race-${randomUUID()}`,
      paymentMethod: "DANA",
    });
    orderIds.push(webCheckout.order.id, telegramOrder.id);

    const paid = await Promise.all([
      confirmOrderPayment({ orderId: webCheckout.order.id, verifiedBy: "web-race-test" }),
      confirmOrderPayment({ orderId: telegramOrder.id, verifiedBy: "telegram-race-test" }),
    ]);
    expect(paid.map((order) => order.status).sort()).toEqual(["FULFILLING", "REFUNDED"]);
    expect(await prisma.digitalStockItem.count({ where: { productId: product.id, status: "RESERVED" } })).toBe(1);

    const winner = paid.find((order) => order.status === "FULFILLING")!;
    const loser = paid.find((order) => order.status === "REFUNDED")!;
    expect(await prisma.wallet.findUniqueOrThrow({ where: { chatId: loser.chatId } })).toMatchObject({ balance: loser.grandTotal });
    if (winner.channel === "WEB") {
      expect(await prisma.sentDelivery.count({ where: { orderId: winner.id, channel: "WEB", status: "READY" } })).toBe(1);
      expect(await prisma.telegramNotification.count({ where: { orderId: winner.id } })).toBe(0);
    } else {
      expect(await prisma.sentDelivery.count({ where: { orderId: winner.id } })).toBe(0);
      expect(await prisma.telegramNotification.count({ where: { orderId: winner.id, kind: "DIGITAL_FILE" } })).toBe(1);
    }
  }, 30_000);

  it("locks repeated password failures without exposing the stored password", async () => {
    const email = `lock-${randomUUID()}@example.com`;
    const password = "CorrectPassword123";
    const customer = (await getOrCreateWebCustomer({ email, password })).customer;
    customerIds.push(customer.id);
    chatIds.push(`web:${customer.id}`);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(getOrCreateWebCustomer({
        email,
        password: `WrongPassword${attempt}xx`,
      })).rejects.toBeInstanceOf(WebCustomerAccessError);
    }
    const locked = await prisma.webCustomer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(locked.failedAttempts).toBe(5);
    expect(locked.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    await expect(getOrCreateWebCustomer({ email, password })).rejects.toBeInstanceOf(WebCustomerAccessError);
  }, 30_000);

  it("cancels a pending web invoice without creating Telegram notifications", async () => {
    const product = await prisma.product.create({
      data: {
        slug: `web-cancel-${randomUUID()}`,
        name: "Web cancellation product",
        description: "Disposable web cancellation integration product",
        price: 9_000,
      },
    });
    productIds.push(product.id);
    await importStockFiles({
      productId: product.id,
      files: [{ filename: "cancel-test.txt", content: Buffer.from("cancel-test-" + randomUUID()) }],
    });
    const email = `cancel-${randomUUID()}@example.com`;
    const password = "CancelPassword123";
    const checkout = await createWebCheckout({
      email,
      password,
      productId: product.id,
      quantity: 1,
      paymentMethod: "DANA",
      idempotencyKey: `web-cancel-${randomUUID()}`,
    });
    const customer = (await getOrCreateWebCustomer({ email, password })).customer;
    customerIds.push(customer.id);
    chatIds.push(`web:${customer.id}`);
    orderIds.push(checkout.order.id);
    const cancelled = await cancelWebOrder({
      customerId: customer.id,
      invoiceNumber: checkout.order.invoiceNumber,
    });
    expect(cancelled).toMatchObject({ status: "CANCELLED", paymentStatus: "EXPIRED" });
    expect(await prisma.telegramNotification.count({ where: { orderId: checkout.order.id } })).toBe(0);
  }, 30_000);

  it("exposes product guidance and attachments only after a web payment is confirmed", async () => {
    const attachmentContent = "paid-web-guide-" + randomUUID();
    const attachment = await prepareProductAttachment(
      new File([attachmentContent], "panduan-web.txt", { type: "text/plain" }),
    );
    const product = await prisma.product.create({
      data: {
        slug: `web-attachment-${randomUUID()}`,
        name: "Web attachment product",
        description: "Disposable paid attachment integration product",
        price: 10_000,
        postDeliveryInstructions: "Buka file panduan, lalu ikuti langkah secara berurutan.",
        redeemUrl: "https://example.com/claim",
        ...attachment,
      },
    });
    productIds.push(product.id);
    await importStockFiles({
      productId: product.id,
      files: [{ filename: "account.txt", content: Buffer.from("account-" + randomUUID()) }],
    });
    const email = `attachment-${randomUUID()}@example.com`;
    const password = "AttachmentPassword123";
    const checkout = await createWebCheckout({
      email,
      password,
      productId: product.id,
      quantity: 1,
      paymentMethod: "DANA",
      idempotencyKey: `web-attachment-${randomUUID()}`,
    });
    const customer = (await getOrCreateWebCustomer({ email, password })).customer;
    customerIds.push(customer.id);
    chatIds.push(`web:${customer.id}`);
    orderIds.push(checkout.order.id);

    const pendingDetail = await getWebCustomerOrder(customer.id, checkout.order.invoiceNumber);
    expect(pendingDetail).toMatchObject({ guidance: [], attachments: [] });
    expect(await downloadWebProductAttachment({
      customerId: customer.id,
      invoiceNumber: checkout.order.invoiceNumber,
      productId: product.id,
    })).toBeNull();

    await confirmOrderPayment({ orderId: checkout.order.id, verifiedBy: "attachment-test" });
    const paidDetail = await getWebCustomerOrder(customer.id, checkout.order.invoiceNumber);
    expect(paidDetail?.guidance).toEqual([{
      productId: product.id,
      productName: product.name,
      text: "Buka file panduan, lalu ikuti langkah secara berurutan.",
      entities: [],
      redeemUrl: "https://example.com/claim",
    }]);
    expect(paidDetail?.attachments).toEqual([expect.objectContaining({
      productId: product.id,
      productName: product.name,
      filename: "panduan-web.txt",
    })]);

    const downloaded = await downloadWebProductAttachment({
      customerId: customer.id,
      invoiceNumber: checkout.order.invoiceNumber,
      productId: product.id,
    });
    expect(downloaded?.content.toString("utf8")).toBe(attachmentContent);
    downloaded?.content.fill(0);

    const other = await getOrCreateWebCustomer({
      email: `attachment-other-${randomUUID()}@example.com`,
      password,
    });
    customerIds.push(other.customer.id);
    chatIds.push(`web:${other.customer.id}`);
    expect(await getWebCustomerOrder(other.customer.id, checkout.order.invoiceNumber)).toBeNull();
    expect(await downloadWebProductAttachment({
      customerId: other.customer.id,
      invoiceNumber: checkout.order.invoiceNumber,
      productId: product.id,
    })).toBeNull();

    await prisma.order.update({
      where: { id: checkout.order.id },
      data: { status: "REFUNDED" },
    });
    const refundedDetail = await getWebCustomerOrder(customer.id, checkout.order.invoiceNumber);
    expect(refundedDetail).toMatchObject({ guidance: [], attachments: [] });
    expect(await downloadWebProductAttachment({
      customerId: customer.id,
      invoiceNumber: checkout.order.invoiceNumber,
      productId: product.id,
    })).toBeNull();
  }, 30_000);

  it("queues one public website announcement only after all units finish, even with concurrent downloads", async () => {
    const previousChannel = process.env.TELEGRAM_SUCCESS_CHANNEL_ID;
    process.env.TELEGRAM_SUCCESS_CHANNEL_ID = "-100000000123";
    try {
      const product = await prisma.product.create({ data: { slug: `web-channel-${randomUUID()}`, name: "Disposable website purchase", description: "Integration-only product", price: 500 } });
      productIds.push(product.id);
      await importStockFiles({ productId: product.id, files: [1, 2, 3].map(unit => ({ filename: `sample-${unit}.txt`, content: Buffer.from(`unit-${unit}-${randomUUID()}`) })) });
      const email = `channel-${randomUUID()}@example.com`, password = "DisposableTestPassword123";
      const customer = (await getOrCreateWebCustomer({ email, password })).customer;
      customerIds.push(customer.id); chatIds.push(`web:${customer.id}`);
      const checkout = await createWebCheckout({ email, password, productId: product.id, quantity: 3, paymentMethod: "DANA", idempotencyKey: `channel-${randomUUID()}` });
      orderIds.push(checkout.order.id);
      const noticeWhere = { orderId: checkout.order.id, kind: "SUCCESS_CHANNEL" };
      expect(await prisma.telegramNotification.count({ where: noticeWhere })).toBe(0);
      await confirmOrderPayment({ orderId: checkout.order.id, verifiedBy: "integration-only" });
      const receipts = await prisma.sentDelivery.findMany({ where: { orderId: checkout.order.id }, orderBy: { id: "asc" } });
      expect(receipts).toHaveLength(3);
      expect(await prisma.telegramNotification.count({ where: noticeWhere })).toBe(0);
      const download = (index: number) => downloadWebDelivery({ customerId: customer.id, invoiceNumber: checkout.order.invoiceNumber, receiptId: receipts[index].id });
      (await download(0)).content.fill(0);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: checkout.order.id } })).status).toBe("FULFILLING");
      expect(await prisma.telegramNotification.count({ where: noticeWhere })).toBe(0);
      const files = await Promise.all([download(1), download(2), download(1)]);
      files.forEach(file => file.content.fill(0));
      expect((await prisma.order.findUniqueOrThrow({ where: { id: checkout.order.id } })).status).toBe("COMPLETED");
      const notices = await prisma.telegramNotification.findMany({ where: { orderId: checkout.order.id } });
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({ kind: "SUCCESS_CHANNEL", chatId: "-100000000123", dedupeKey: `success-channel:order:${checkout.order.id}`, messageText: null });
      const repeats = await Promise.all([download(0), download(1), download(2)]);
      repeats.forEach(file => file.content.fill(0));
      expect(await prisma.telegramNotification.count({ where: noticeWhere })).toBe(1);
      expect(await prisma.digitalStockItem.count({ where: { deliveredOrderId: checkout.order.id, status: "DELIVERED" } })).toBe(3);
    } finally {
      if (previousChannel === undefined) delete process.env.TELEGRAM_SUCCESS_CHANNEL_ID;
      else process.env.TELEGRAM_SUCCESS_CHANNEL_ID = previousChannel;
    }
  }, 30_000);
});
