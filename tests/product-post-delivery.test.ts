import { describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import {
  completedProductDeliveryDocument,
  completedProductDeliveryReplyMarkup,
  parseProductPostDeliverySnapshot,
  productPostDeliveryDedupeKey,
  productPostDeliveryMessage,
  productPostDeliveryReplyMarkup,
  productGuideAttachmentPrerequisiteState,
  PRODUCT_POST_DELIVERY_PRIORITY,
  queueProductPostDeliveryNotifications,
  serializeProductPostDeliverySnapshot,
  serializeStoredProductPostDeliverySnapshot,
  successChannelPrerequisiteState,
} from "@/server/products/post-delivery";

describe("product post-delivery instructions", () => {
  it("snapshots the product, invoice, message, and optional redeem button", () => {
    const serialized = serializeProductPostDeliverySnapshot({
      productName: "CDK Claude",
      invoiceNumber: "TGS-123",
      instructions: "Masukkan kode dari file yang sudah dikirim.",
      instructionEntities: [
        { type: "bold", offset: 0, length: 8 },
      ],
      redeemUrl: "https://redeem.example.com/",
    });
    const snapshot = parseProductPostDeliverySnapshot(serialized);

    expect(productPostDeliveryDedupeKey("order-1", "product-1")).toBe(
      "product-post-delivery:order-1:product-1",
    );
    expect(snapshot?.messageText).toBe(
      productPostDeliveryMessage({
        productName: "CDK Claude",
        invoiceNumber: "TGS-123",
        instructions: "Masukkan kode dari file yang sudah dikirim.",
        redeemUrl: "https://redeem.example.com/",
      }),
    );
    expect(productPostDeliveryReplyMarkup(snapshot!)).toEqual({
      inline_keyboard: [[
        { text: "Buka halaman redeem", url: "https://redeem.example.com/" },
      ]],
    });
    expect(snapshot?.messageEntities).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "bold", length: 8 }),
      expect.objectContaining({ type: "code", length: 7 }),
    ]));
    const formattedInstruction = snapshot?.messageEntities.find(
      (entity) =>
        entity.type === "bold" &&
        snapshot.messageText.slice(entity.offset, entity.offset + entity.length) === "Masukkan",
    );
    expect(formattedInstruction).toBeDefined();
  });

  it("rejects malformed snapshots and strips an unsafe stored redeem URL", () => {
    expect(parseProductPostDeliverySnapshot("not-json")).toBeNull();
    expect(parseProductPostDeliverySnapshot(JSON.stringify({
      version: 1,
      productName: "CDK",
      invoiceNumber: "TGS-1",
      messageText: "Klik redeem",
      messageEntities: [],
      redeemUrl: "javascript:alert(1)",
    }))).toMatchObject({
      messageText: "Klik redeem",
      messageEntities: [],
      redeemUrl: null,
    });
  });

  it("preserves readable stored guidance when legacy rich-text metadata is invalid", () => {
    const serialized = serializeStoredProductPostDeliverySnapshot({
      productName: "CDK",
      invoiceNumber: "TGS-2",
      instructions: "Buka\r\nhalaman redeem.",
      instructionEntities: [{ type: "bold", offset: 999, length: 5 }],
      redeemUrl: "https://redeem.example.com/",
    });
    const snapshot = parseProductPostDeliverySnapshot(serialized);

    expect(snapshot?.messageText).toContain("Buka\nhalaman redeem.");
    expect(snapshot?.messageEntities).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ offset: 999 })]),
    );
    expect(snapshot?.redeemUrl).toBe("https://redeem.example.com/");
  });

  it("combines purchase status, guide, and actions into one final message", () => {
    const snapshot = parseProductPostDeliverySnapshot(
      serializeProductPostDeliverySnapshot({
        productName: "ChatGPT Business",
        invoiceNumber: "TGS-9",
        instructions: "Claim: Cek linknya!",
        instructionEntities: [{ type: "bold", offset: 0, length: 5 }],
        redeemUrl: "https://redeem.example.com/",
      }),
    );
    const document = completedProductDeliveryDocument({
      snapshot: snapshot!,
      quantity: 1,
      grandTotal: 50_000,
    });
    const replyMarkup = completedProductDeliveryReplyMarkup({
      snapshot: snapshot!,
      orderId: "order-9",
    });

    expect(document.text).toBe([
      "Pembelian selesai",
      "",
      "Invoice: TGS-9",
      "Produk: ChatGPT Business",
      "Jumlah: 1 item",
      "Total: Rp\u00a050.000",
      "Status: File produk terlampir pada pesan ini.",
      "",
      "Panduan",
      "Claim: Cek linknya!",
    ].join("\n"));
    expect(document.text.match(/Invoice:/g)).toHaveLength(1);
    expect(document.text.match(/Produk:/g)).toHaveLength(1);
    expect(document.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "bold", offset: 0 }),
      expect.objectContaining({ type: "code" }),
      expect.objectContaining({
        type: "bold",
        offset: document.text.indexOf("Claim"),
        length: 5,
      }),
    ]));
    expect(replyMarkup.inline_keyboard.flat().map((button) => button.text)).toEqual([
      "Buka halaman redeem",
      "Detail order",
      "File tidak terlihat",
      "Kembali ke katalog",
    ]);
    expect(replyMarkup.inline_keyboard.flat().map((button) => button.text)).not.toContain(
      "Saya sudah menerima file",
    );
  });

  it("anchors header entities to their own fields even when product text repeats the title", () => {
    const snapshot = parseProductPostDeliverySnapshot(
      serializeProductPostDeliverySnapshot({
        productName: "Panduan",
        invoiceNumber: "TGS-4",
        instructions: "Ikuti panduan.",
        instructionEntities: [],
        redeemUrl: null,
      }),
    );
    const productEntity = snapshot?.messageEntities.find(
      (entity) =>
        entity.type === "bold" &&
        snapshot.messageText.slice(entity.offset, entity.offset + entity.length) === "Panduan" &&
        entity.offset > snapshot.messageText.indexOf("Produk:"),
    );

    expect(productEntity).toBeDefined();
  });

  it("falls back to immutable plain text when a queued entity snapshot is malformed", () => {
    const snapshot = parseProductPostDeliverySnapshot(JSON.stringify({
      version: 1,
      productName: "CDK",
      invoiceNumber: "TGS-3",
      messageText: "Panduan tetap terbaca",
      messageEntities: [{ type: "bold", offset: 999, length: 5 }],
      redeemUrl: null,
    }));

    expect(snapshot).toMatchObject({
      messageText: "Panduan tetap terbaca",
      messageEntities: [],
    });
  });

  it("queues one immutable notification per distinct configured product", async () => {
    const upserts: Array<Record<string, unknown>> = [];
    const tx = {
      product: {
        findMany: async () => [
          {
            id: "product-1",
            postDeliveryInstructions: "Redeem setelah login.",
            postDeliveryEntities: [],
            redeemUrl: "https://redeem.example.com/",
          },
          {
            id: "product-2",
            postDeliveryInstructions: null,
            postDeliveryEntities: [],
            redeemUrl: "https://activate.example.com/",
          },
        ],
      },
      telegramNotification: {
        upsert: async (args: Record<string, unknown>) => {
          upserts.push(args);
          return args;
        },
      },
    } as unknown as Prisma.TransactionClient;

    const queued = await queueProductPostDeliveryNotifications({
      tx,
      orderId: "order-1",
      chatId: "chat-1",
      invoiceNumber: "TGS-1",
      products: [
        { id: "product-1", name: "CDK A" },
        { id: "product-1", name: "CDK A" },
        { id: "product-2", name: "CDK B" },
      ],
    });

    expect(queued).toBe(2);
    expect(upserts).toHaveLength(2);
    expect(upserts.map((entry) => entry.where)).toEqual([
      { dedupeKey: "product-post-delivery:order-1:product-1" },
      { dedupeKey: "product-post-delivery:order-1:product-2" },
    ]);
    expect(upserts[0].create).toMatchObject({
      kind: "PRODUCT_POST_DELIVERY",
      priority: PRODUCT_POST_DELIVERY_PRIORITY,
      productId: "product-1",
    });
  });

  it("queues a plain-text guide instead of aborting on malformed persisted entities", async () => {
    const upserts: Array<Record<string, unknown>> = [];
    const tx = {
      product: {
        findMany: async () => [{
          id: "product-legacy",
          postDeliveryInstructions: "Buka panduan ini.",
          postDeliveryEntities: [{ type: "bold", offset: 500, length: 4 }],
          redeemUrl: null,
        }],
      },
      telegramNotification: {
        upsert: async (args: Record<string, unknown>) => {
          upserts.push(args);
          return args;
        },
      },
    } as unknown as Prisma.TransactionClient;

    await expect(queueProductPostDeliveryNotifications({
      tx,
      orderId: "order-legacy",
      chatId: "123",
      invoiceNumber: "TGS-LEGACY",
      products: [{ id: "product-legacy", name: "Produk lama" }],
    })).resolves.toBe(1);

    const create = upserts[0].create as { messageText: string };
    const snapshot = parseProductPostDeliverySnapshot(create.messageText);
    expect(snapshot).toMatchObject({
      messageEntities: expect.arrayContaining([
        expect.objectContaining({ type: "bold" }),
        expect.objectContaining({ type: "code" }),
      ]),
    });
    expect(snapshot?.messageEntities).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ offset: 500 })]),
    );
  });

  it("queues a final summary even when a product has no custom guide", async () => {
    const upserts: Array<Record<string, unknown>> = [];
    const tx = {
      product: { findMany: async () => [] },
      telegramNotification: {
        upsert: async (args: Record<string, unknown>) => {
          upserts.push(args);
          return args;
        },
      },
    } as unknown as Prisma.TransactionClient;

    await expect(queueProductPostDeliveryNotifications({
      tx,
      orderId: "order-basic",
      chatId: "123",
      invoiceNumber: "TGS-BASIC",
      products: [{ id: "product-basic", name: "Produk basic" }],
    })).resolves.toBe(1);

    const create = upserts[0].create as { messageText: string };
    const snapshot = parseProductPostDeliverySnapshot(create.messageText);
    expect(snapshot).toMatchObject({
      productName: "Produk basic",
      invoiceNumber: "TGS-BASIC",
      redeemUrl: null,
    });
    expect(completedProductDeliveryDocument({
      snapshot: snapshot!,
      quantity: 1,
      grandTotal: 10_000,
    }).text).not.toContain("Panduan");
  });

  it("holds the success channel until every customer follow-up is sent", () => {
    expect(successChannelPrerequisiteState([])).toBe("READY");
    expect(successChannelPrerequisiteState(["SENT", "SENT"])).toBe("READY");
    expect(successChannelPrerequisiteState(["SENT", "PENDING"])).toBe("WAITING");
    expect(successChannelPrerequisiteState(["SENT", "MANUAL_REVIEW"])).toBe("BLOCKED");
  });

  it("does not withhold a private guide after a definite optional-attachment failure", () => {
    expect(productGuideAttachmentPrerequisiteState([])).toBe("READY");
    expect(productGuideAttachmentPrerequisiteState(["SENT", "FAILED"])).toBe("READY");
    expect(productGuideAttachmentPrerequisiteState(["SENT", "PENDING"])).toBe("WAITING");
    expect(productGuideAttachmentPrerequisiteState(["SENT", "PROCESSING"])).toBe("WAITING");
    expect(productGuideAttachmentPrerequisiteState(["FAILED", "MANUAL_REVIEW"])).toBe("BLOCKED");
  });
});
