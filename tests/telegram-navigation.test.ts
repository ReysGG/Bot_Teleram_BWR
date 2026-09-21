import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadTelegramDocument,
  editMessageMedia,
  editMessageText,
  retryableTelegramStatus,
  sendDocument,
  sendMessage,
  sendPhoto,
  sendPhotoBuffer,
  shouldRetryTelegramWithoutCustomEmoji,
  telegramPayloadWithoutEntityFormatting,
  TelegramApiError,
} from "@/server/telegram/api";
import {
  callbackNavigationMessageId,
  isPrivateTelegramUpdate,
  isMessageNotModifiedError,
  navigationMessageTarget,
} from "@/server/telegram/flow";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Telegram single-bubble navigation", () => {
  it("retries rate limits/server failures but drops permanent recipient errors", () => {
    expect(retryableTelegramStatus(429)).toBe(true);
    expect(retryableTelegramStatus(503)).toBe(true);
    expect(retryableTelegramStatus(400)).toBe(false);
    expect(retryableTelegramStatus(403)).toBe(false);
  });

  it("sends editMessageText with the existing message id", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      editMessageText({
        chatId: "123",
        messageId: 42,
        text: "\u{1F9E0} Menu baru",
        entities: [
          {
            type: "custom_emoji",
            offset: 0,
            length: 2,
            custom_emoji_id: "123456789",
          },
        ],
        replyMarkup: {
          inline_keyboard: [
            [{
              text: "Salin",
              copy_text: { text: "25091" },
              icon_custom_emoji_id: "123456789",
            }],
            [{ text: "Kembali", callback_data: "menu" }],
          ],
        },
      }),
    ).resolves.toEqual({ message_id: 42 });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      chat_id: "123",
      message_id: 42,
      text: "\u{1F9E0} Menu baru",
      entities: [
        {
          type: "custom_emoji",
          offset: 0,
          length: 2,
          custom_emoji_id: "123456789",
        },
      ],
      reply_markup: {
        inline_keyboard: [
          [{
            text: "Salin",
            copy_text: { text: "25091" },
            icon_custom_emoji_id: "123456789",
          }],
          [{ text: "Kembali", callback_data: "menu" }],
        ],
      },
    });
  });

  it("sends and edits catalog photos with caption entities and buttons", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));
    vi.stubGlobal("fetch", fetchMock);
    const entities = [{ type: "bold", offset: 0, length: 6 }];
    const replyMarkup = {
      inline_keyboard: [[{ text: "Beli", callback_data: "buy:1" }]],
    };

    await sendPhoto(
      "123",
      "https://store.example/api/catalog/products/1/image",
      "Produk bagus",
      replyMarkup,
      entities,
    );
    await editMessageMedia({
      chatId: "123",
      messageId: 42,
      photo: "https://store.example/api/catalog/products/2/image",
      caption: "Produk baru",
      replyMarkup,
      captionEntities: entities,
    });

    const sendPayload = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    );
    const editPayload = JSON.parse(
      String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body),
    );
    expect(sendPayload).toMatchObject({
      photo: "https://store.example/api/catalog/products/1/image",
      caption: "Produk bagus",
      caption_entities: entities,
      reply_markup: replyMarkup,
    });
    expect(editPayload).toMatchObject({
      message_id: 42,
      media: {
        type: "photo",
        media: "https://store.example/api/catalog/products/2/image",
        caption: "Produk baru",
        caption_entities: entities,
      },
      reply_markup: replyMarkup,
    });
  });

  it("uploads a QR PNG with caption entities and copy buttons", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 47 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const entities = [{ type: "bold", offset: 0, length: 4 }];
    const replyMarkup = {
      inline_keyboard: [[{
        text: "Salin alamat",
        copy_text: { text: "0x1111111111111111111111111111111111111111" },
      }]],
    };

    await expect(sendPhotoBuffer({
      chatId: "123",
      filename: "TGS-USDT-001-USDT-BEP20.png",
      png: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      caption: "USDT BEP20",
      replyMarkup,
      captionEntities: entities,
    })).resolves.toEqual({ message_id: 47 });

    const form = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
      .body as FormData;
    expect(form.get("chat_id")).toBe("123");
    expect(form.get("caption")).toBe("USDT BEP20");
    expect(JSON.parse(String(form.get("reply_markup")))).toEqual(replyMarkup);
    expect(JSON.parse(String(form.get("caption_entities")))).toEqual(entities);
    const photo = form.get("photo") as File;
    expect(photo.name).toBe("TGS-USDT-001-USDT-BEP20.png");
    expect(photo.type).toBe("image/png");
  });

  it("retries a rejected custom emoji send once with Unicode fallback", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error_code: 400,
            description: "Bad Request: can't use custom emoji sticker",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 44 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendMessage(
        "123",
        "\u{1F916} ChatGPT",
        {
          inline_keyboard: [[{
            text: "Beli",
            callback_data: "product:1",
            icon_custom_emoji_id: "987654321",
          }]],
        },
        [{
          type: "custom_emoji",
          offset: 0,
          length: 2,
          custom_emoji_id: "987654321",
        }],
      ),
    ).resolves.toEqual({ message_id: 44 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstPayload = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    );
    const fallbackPayload = JSON.parse(
      String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body),
    );
    expect(firstPayload.entities).toHaveLength(1);
    expect(firstPayload.reply_markup.inline_keyboard[0][0]).toHaveProperty(
      "icon_custom_emoji_id",
    );
    expect(fallbackPayload.text).toBe(firstPayload.text);
    expect(fallbackPayload.entities).toBeUndefined();
    expect(fallbackPayload.reply_markup.inline_keyboard[0][0]).not.toHaveProperty(
      "icon_custom_emoji_id",
    );
  });

  it("does not mask unrelated permanent Telegram errors", () => {
    expect(
      shouldRetryTelegramWithoutCustomEmoji(
        new TelegramApiError(
          "Telegram rejected sendMessage: 400 message is too long",
          true,
          undefined,
          false,
          400,
        ),
        {
          entities: [{ type: "custom_emoji", offset: 0, length: 2 }],
        },
      ),
    ).toBe(false);
  });

  it("falls back when an older Telegram endpoint rejects button styles", () => {
    expect(
      shouldRetryTelegramWithoutCustomEmoji(
        new TelegramApiError(
          "Telegram rejected sendMessage: 400 Bad Request: BUTTON_STYLE_INVALID",
          true,
          undefined,
          false,
          400,
        ),
        {
          reply_markup: {
            inline_keyboard: [[{
              text: "Tersedia",
              callback_data: "product:1",
              style: "success",
            }]],
          },
        },
      ),
    ).toBe(true);
  });

  it("retries malformed UTF-16 entities without custom emoji decoration", () => {
    expect(
      shouldRetryTelegramWithoutCustomEmoji(
        new TelegramApiError(
          "Telegram rejected sendDocument: 400 Bad Request: entity beginning at UTF-16 offset 26 ends in a middle of a UTF-16 symbol at byte offset 33",
          true,
          undefined,
          false,
          400,
        ),
        {
          caption_entities: [{
            type: "custom_emoji",
            offset: 26,
            length: 2,
            custom_emoji_id: "123456789",
          }],
        },
      ),
    ).toBe(true);
  });

  it("recognizes ENTITY_TEXT_INVALID even when the range is not a custom emoji", () => {
    expect(
      shouldRetryTelegramWithoutCustomEmoji(
        new TelegramApiError(
          "Telegram rejected sendDocument: 400 Bad Request: ENTITY_TEXT_INVALID",
          true,
          undefined,
          false,
          400,
        ),
        { caption_entities: [{ type: "code", offset: 3, length: 8 }] },
      ),
    ).toBe(true);
    const fallback = telegramPayloadWithoutEntityFormatting({
      caption_entities: [{ type: "code", offset: 3, length: 8 }],
      caption: "same caption",
    });
    expect(fallback.caption).toBe("same caption");
    expect(fallback.caption_entities).toBeUndefined();
  });

  it("resends the same document without caption entities after ENTITY_TEXT_INVALID", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          ok: false,
          error_code: 400,
          description: "Bad Request: ENTITY_TEXT_INVALID",
        }), { status: 400, headers: { "Content-Type": "application/json" } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 46 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendDocument({
      chatId: "123",
      filename: "delivery.txt",
      fileContent: "credential",
      caption: "same caption",
      captionEntities: [{ type: "code", offset: 3, length: 4 }],
    })).resolves.toEqual({ message_id: 46 });

    const firstForm = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    const fallbackForm = (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as FormData;
    expect(firstForm.get("caption_entities")).toBeTruthy();
    expect(fallbackForm.get("caption_entities")).toBeNull();
    expect(fallbackForm.get("caption")).toBe("same caption");
    expect(fallbackForm.get("document")).toBeTruthy();
  });

  it("sends document caption entities and falls back without custom decoration", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error_code: 400,
            description: "Bad Request: CUSTOM_EMOJI_ID_INVALID",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { message_id: 45 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendDocument({
        chatId: "123",
        filename: "delivery.txt",
        fileContent: "credential",
        caption: "\u{1F9E0} Claude",
        captionEntities: [{
          type: "custom_emoji",
          offset: 0,
          length: 2,
          custom_emoji_id: "123456789",
        }],
        replyMarkup: {
          inline_keyboard: [[{
            text: "Order",
            callback_data: "order:1",
            icon_custom_emoji_id: "123456789",
          }]],
        },
      }),
    ).resolves.toEqual({ message_id: 45 });

    const firstForm = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
      .body as FormData;
    const fallbackForm = (fetchMock.mock.calls[1] as [string, RequestInit])[1]
      .body as FormData;
    expect(firstForm.get("caption_entities")).toBeTruthy();
    expect(String(firstForm.get("reply_markup"))).toContain(
      "icon_custom_emoji_id",
    );
    expect(fallbackForm.get("caption")).toBe("\u{1F9E0} Claude");
    expect(fallbackForm.get("caption_entities")).toBeNull();
    expect(String(fallbackForm.get("reply_markup"))).not.toContain(
      "icon_custom_emoji_id",
    );
  });

  it("treats Telegram's unchanged-message response as a successful no-op", () => {
    expect(
      isMessageNotModifiedError(
        new TelegramApiError(
          "Telegram rejected editMessageText: 400 message is not modified",
          true,
        ),
      ),
    ).toBe(true);
    expect(
      isMessageNotModifiedError(
        new TelegramApiError("Telegram request outcome is unknown", false),
      ),
    ).toBe(false);
  });

  it("reuses the remembered navigation bubble for slash commands", () => {
    expect(navigationMessageTarget(undefined, 91)).toBe(91);
    expect(navigationMessageTarget(105, 91)).toBe(105);
    expect(navigationMessageTarget(undefined, null)).toBeUndefined();
  });

  it("never treats a delivered document as an editable navigation bubble", () => {
    expect(
      callbackNavigationMessageId({
        message_id: 105,
        document: { file_id: "file", file_unique_id: "unique" },
      }),
    ).toBeUndefined();
    expect(callbackNavigationMessageId({ message_id: 106 })).toBe(106);
  });

  it("allows commerce flow only in a private bot chat", () => {
    expect(
      isPrivateTelegramUpdate({
        update_id: 1,
        message: { message_id: 1, chat: { id: 10, type: "private" } },
      }),
    ).toBe(true);
    expect(
      isPrivateTelegramUpdate({
        update_id: 2,
        message: { message_id: 2, chat: { id: -20, type: "supergroup" } },
      }),
    ).toBe(false);
    expect(
      isPrivateTelegramUpdate({
        update_id: 3,
        callback_query: {
          id: "callback",
          from: { id: 10 },
          message: { message_id: 3, chat: { id: -30, type: "channel" } },
        },
      }),
    ).toBe(false);
  });

  it("downloads Telegram documents with a hard streamed-size limit", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { file_path: "documents/file.json" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response("{\"ok\":true}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadTelegramDocument({
        document: { file_id: "file-id", file_unique_id: "unique", file_size: 11 },
        maxBytes: 1024,
      }),
    ).resolves.toEqual(Buffer.from("{\"ok\":true}"));
    expect(String(fetchMock.mock.calls[1][0])).toContain("documents/file.json");
  });

  it("rejects Telegram files whose declared size exceeds the limit before download", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadTelegramDocument({
        document: { file_id: "file-id", file_unique_id: "unique", file_size: 2048 },
        maxBytes: 1024,
      }),
    ).rejects.toThrow("melebihi batas");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
