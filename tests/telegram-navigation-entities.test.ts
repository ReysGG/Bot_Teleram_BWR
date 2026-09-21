import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteMessage,
  editMessageCaption,
  editMessageMedia,
  findUnique,
  sendMessage,
  sendPhoto,
  sendPhotoBuffer,
  upsert,
} = vi.hoisted(() => ({
  deleteMessage: vi.fn(),
  editMessageCaption: vi.fn(),
  editMessageMedia: vi.fn(),
  findUnique: vi.fn(),
  sendMessage: vi.fn(),
  sendPhoto: vi.fn(),
  sendPhotoBuffer: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    botSession: {
      findUnique,
      updateMany: vi.fn(),
      upsert,
    },
    sentDelivery: { findFirst: vi.fn() },
    payment: { findFirst: vi.fn() },
  },
}));
vi.mock("@/server/telegram/api", () => ({
  answerCallbackQuery: vi.fn(),
  deleteMessage,
  editMessageCaption,
  editMessageMedia,
  editMessageText: vi.fn(),
  sendMessage,
  sendPhoto,
  sendPhotoBuffer,
  TelegramApiError: class TelegramApiError extends Error {
    constructor(
      message: string,
      readonly responseReceived: boolean,
      readonly retryAfterSeconds?: number,
      readonly retryable = true,
      readonly statusCode?: number,
    ) {
      super(message);
    }
  },
}));

import { renderNavigationMessage } from "@/server/telegram/navigation";
import { TelegramApiError, editMessageText } from "@/server/telegram/api";
import { prisma } from "@/server/db/prisma";

describe("Telegram navigation custom emoji entities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue(null);
    vi.mocked(prisma.payment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.sentDelivery.findFirst).mockResolvedValue(null);
    sendMessage.mockResolvedValue({ message_id: 51 });
    deleteMessage.mockResolvedValue(true);
    upsert.mockResolvedValue({});
  });

  it("opens catalog in a new bubble without overwriting an active invoice", async () => {
    findUnique.mockResolvedValue({ navigationMessageId:42 });
    vi.mocked(prisma.payment.findFirst).mockResolvedValue({orderId:"invoice-1"} as never);
    await renderNavigationMessage({chatId:"123",messageId:42,text:"Catalog"});
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(editMessageText).not.toHaveBeenCalled();
    expect(deleteMessage).not.toHaveBeenCalled();
  });
  it("edits only the matching invoice and never a delivered credential", async () => {
    vi.mocked(prisma.payment.findFirst).mockResolvedValue({orderId:"invoice-1"} as never);
    vi.mocked(editMessageText).mockResolvedValue({message_id:42});
    await renderNavigationMessage({chatId:"123",messageId:42,invoiceOrderId:"invoice-1",text:"Invoice"});
    expect(editMessageText).toHaveBeenCalledTimes(1);
    vi.mocked(prisma.sentDelivery.findFirst).mockResolvedValue({id:"receipt"} as never);
    await renderNavigationMessage({chatId:"123",messageId:42,invoiceOrderId:"invoice-1",text:"Invoice"});
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(deleteMessage).not.toHaveBeenCalled();
  });

  it("forwards entities when sending a new navigation bubble", async () => {
    const entities = [{
      type: "custom_emoji",
      offset: 0,
      length: 2,
      custom_emoji_id: "5368324170671202286",
    }];

    await renderNavigationMessage({
      chatId: "123",
      text: "emoji ChatGPT",
      entities,
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "123",
      "emoji ChatGPT",
      undefined,
      entities,
    );
  });

  it("sends a photo bubble and remembers its message id", async () => {
    sendPhoto.mockResolvedValueOnce({ message_id: 88 });
    const entities = [{ type: "bold", offset: 0, length: 6 }];
    const replyMarkup = {
      inline_keyboard: [[{ text: "Beli", callback_data: "buy:1" }]],
    };

    await renderNavigationMessage({
      chatId: "123",
      text: "Produk bagus",
      entities,
      replyMarkup,
      photoUrl: "https://store.example/product.jpg",
    });

    expect(sendPhoto).toHaveBeenCalledWith(
      "123",
      "https://store.example/product.jpg",
      "Produk bagus",
      replyMarkup,
      entities,
    );
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { navigationMessageId: 88 },
    }));
  });

  it("edits an existing navigation bubble into product media", async () => {
    findUnique.mockResolvedValueOnce({ navigationMessageId: 77 });
    editMessageMedia.mockResolvedValueOnce({ message_id: 77 });

    await renderNavigationMessage({
      chatId: "123",
      text: "Produk bagus",
      photoUrl: "https://store.example/product.jpg",
    });

    expect(editMessageMedia).toHaveBeenCalledWith(expect.objectContaining({
      chatId: "123",
      messageId: 77,
      photo: "https://store.example/product.jpg",
      caption: "Produk bagus",
    }));
    expect(sendPhoto).not.toHaveBeenCalled();
  });

  it("replaces a text bubble with an uploaded QR photo and remembers the new message", async () => {
    findUnique.mockResolvedValueOnce({ navigationMessageId: 77 });
    sendPhotoBuffer.mockResolvedValueOnce({ message_id: 91 });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const replyMarkup = {
      inline_keyboard: [[{ text: "Sudah transfer", callback_data: "usdt:1" }]],
    };

    await renderNavigationMessage({
      chatId: "123",
      text: "Bayar ke address ini",
      replyMarkup,
      photoBuffer: { filename: "invoice.png", png },
    });

    expect(sendPhotoBuffer).toHaveBeenCalledWith(expect.objectContaining({
      chatId: "123",
      filename: "invoice.png",
      png,
      caption: "Bayar ke address ini",
      replyMarkup,
    }));
    expect(deleteMessage).toHaveBeenCalledWith("123", 77);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { navigationMessageId: 91 },
    }));
  });

  it("edits only the caption when refreshing the same QR invoice photo", async () => {
    findUnique.mockResolvedValueOnce({ navigationMessageId: 91 });
    editMessageCaption.mockResolvedValueOnce({ message_id: 91 });

    await renderNavigationMessage({
      chatId: "123",
      messageId: 91,
      text: "Konfirmasi 4/12",
      photoBuffer: {
        filename: "invoice.png",
        png: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        reuseExistingPhoto: true,
      },
    });

    expect(editMessageCaption).toHaveBeenCalledWith(expect.objectContaining({
      chatId: "123",
      messageId: 91,
      caption: "Konfirmasi 4/12",
    }));
    expect(sendPhotoBuffer).not.toHaveBeenCalled();
    expect(deleteMessage).not.toHaveBeenCalled();
  });

  it("falls back once to the same invoice text after a definite PNG rejection", async () => {
    sendPhotoBuffer.mockRejectedValueOnce(new TelegramApiError(
      "Telegram rejected sendPhoto: 400 bad PNG",
      true,
      undefined,
      false,
      400,
    ));
    sendMessage.mockResolvedValueOnce({ message_id: 93 });
    const replyMarkup = {
      inline_keyboard: [[{ text: "Salin", copy_text: { text: "0x111" } }]],
    };

    await renderNavigationMessage({
      chatId: "123",
      text: "Invoice USDT tetap lengkap",
      replyMarkup,
      photoBuffer: {
        filename: "invoice.png",
        png: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      },
    });

    expect(sendPhotoBuffer).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      "123",
      "Invoice USDT tetap lengkap",
      replyMarkup,
      [],
    );
  });

  it("does not create a fallback bubble when PNG upload outcome is unknown", async () => {
    sendPhotoBuffer.mockRejectedValueOnce(new TelegramApiError(
      "Telegram photo outcome is unknown",
      false,
    ));

    await expect(renderNavigationMessage({
      chatId: "123",
      text: "Invoice USDT",
      photoBuffer: {
        filename: "invoice.png",
        png: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      },
    })).rejects.toThrow("outcome is unknown");

    expect(sendPhotoBuffer).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(deleteMessage).not.toHaveBeenCalled();
  });

  it("falls back to the same text product detail when Telegram rejects an image", async () => {
    sendPhoto.mockRejectedValueOnce(new TelegramApiError(
      "Telegram rejected sendPhoto: 400 bad image",
      true,
      undefined,
      false,
      400,
    ));
    sendMessage.mockResolvedValueOnce({ message_id: 89 });

    await renderNavigationMessage({
      chatId: "123",
      text: "Produk tetap bisa dibeli",
      photoUrl: "https://store.example/broken.jpg",
      replyMarkup: {
        inline_keyboard: [[{ text: "Beli", callback_data: "buy:1" }]],
      },
    });

    expect(sendMessage).toHaveBeenCalledWith(
      "123",
      "Produk tetap bisa dibeli",
      expect.objectContaining({ inline_keyboard: expect.any(Array) }),
      [],
    );
  });
});
