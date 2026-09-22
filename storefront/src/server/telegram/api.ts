import { requireEnv } from "@/server/env";

type InlineKeyboardButtonDecoration = {
  icon_custom_emoji_id?: string;
  style?: "danger" | "success" | "primary";
};

export type InlineKeyboardButton = InlineKeyboardButtonDecoration & (
  | { text: string; callback_data: string; url?: never; copy_text?: never }
  | { text: string; url: string; callback_data?: never; copy_text?: never }
  | {
      text: string;
      copy_text: { text: string };
      callback_data?: never;
      url?: never;
    }
);
export type InlineKeyboard = { inline_keyboard: InlineKeyboardButton[][] };

export type TelegramMessageEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: Record<string, unknown>;
  language?: string;
  custom_emoji_id?: string;
};

export type TelegramDocument = {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
};

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
};

export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly responseReceived: boolean,
    readonly retryAfterSeconds?: number,
    readonly retryable = true,
    readonly statusCode?: number,
  ) {
    super(message);
  }
}

export function retryableTelegramStatus(status: number) {
  return status === 429 || status >= 500;
}

async function telegramJsonOnce<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${requireEnv("TELEGRAM_BOT_TOKEN")}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );
  } catch (error) {
    const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
    throw new TelegramApiError(`Telegram request outcome is unknown${detail}`.slice(0, 500), false);
  }

  const data = (await response.json().catch(() => ({ ok: false }))) as TelegramResponse<T>;
  if (!response.ok || !data.ok || !data.result) {
    const statusCode = data.error_code ?? response.status;
    throw new TelegramApiError(
      `Telegram rejected ${method}: ${statusCode} ${data.description ?? "unknown error"}`,
      true,
      data.parameters?.retry_after,
      retryableTelegramStatus(statusCode),
      statusCode,
    );
  }
  return data.result;
}

function withoutCustomEmojiEntities(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.filter(
    (entity) =>
      !entity ||
      typeof entity !== "object" ||
      (entity as { type?: unknown }).type !== "custom_emoji",
  );
}

export function telegramPayloadWithoutCustomEmoji(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const fallback = { ...payload };
  for (const key of ["entities", "caption_entities"] as const) {
    const entities = withoutCustomEmojiEntities(fallback[key]);
    if (Array.isArray(entities) && entities.length === 0) {
      delete fallback[key];
    } else if (entities !== fallback[key]) {
      fallback[key] = entities;
    }
  }

  const media = fallback.media;
  if (media && typeof media === "object" && !Array.isArray(media)) {
    const cleanMedia = { ...(media as Record<string, unknown>) };
    const captionEntities = withoutCustomEmojiEntities(
      cleanMedia.caption_entities,
    );
    if (Array.isArray(captionEntities) && captionEntities.length === 0) {
      delete cleanMedia.caption_entities;
    } else if (captionEntities !== cleanMedia.caption_entities) {
      cleanMedia.caption_entities = captionEntities;
    }
    fallback.media = cleanMedia;
  }

  const replyMarkup = fallback.reply_markup;
  if (
    replyMarkup &&
    typeof replyMarkup === "object" &&
    Array.isArray((replyMarkup as InlineKeyboard).inline_keyboard)
  ) {
    fallback.reply_markup = {
      ...(replyMarkup as Record<string, unknown>),
      inline_keyboard: (replyMarkup as InlineKeyboard).inline_keyboard.map((row) =>
        row.map(({ icon_custom_emoji_id: _icon, style: _style, ...button }) => button),
      ),
    };
  }
  return fallback;
}

/**
 * Keep the document/text payload intact while removing every entity span.
 * Telegram's ENTITY_TEXT_INVALID can be caused by a regular bold/code/link
 * range, so removing only custom emoji entities is not sufficient.
 */
export function telegramPayloadWithoutEntityFormatting(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const fallback = telegramPayloadWithoutCustomEmoji(payload);
  delete fallback.entities;
  delete fallback.caption_entities;
  const media = fallback.media;
  if (media && typeof media === "object" && !Array.isArray(media)) {
    const cleanMedia = { ...(media as Record<string, unknown>) };
    delete cleanMedia.caption_entities;
    fallback.media = cleanMedia;
  }
  return fallback;
}

function payloadHasCustomEmoji(payload: Record<string, unknown>) {
  const media = payload.media;
  const nestedCaptionEntities =
    media && typeof media === "object" && !Array.isArray(media)
      ? (media as Record<string, unknown>).caption_entities
      : undefined;
  const hasEntity = [
    payload.entities,
    payload.caption_entities,
    nestedCaptionEntities,
  ].some(
    (entities) =>
      Array.isArray(entities) &&
      entities.some(
        (entity) =>
          entity &&
          typeof entity === "object" &&
          (entity as { type?: unknown }).type === "custom_emoji",
      ),
  );
  if (hasEntity) return true;

  const replyMarkup = payload.reply_markup;
  return Boolean(
    replyMarkup &&
      typeof replyMarkup === "object" &&
      Array.isArray((replyMarkup as InlineKeyboard).inline_keyboard) &&
      (replyMarkup as InlineKeyboard).inline_keyboard.some((row) =>
        row.some((button) => Boolean(button.icon_custom_emoji_id)),
      ),
  );
}

function payloadHasButtonStyle(payload: Record<string, unknown>) {
  const replyMarkup = payload.reply_markup;
  return Boolean(
    replyMarkup &&
      typeof replyMarkup === "object" &&
      Array.isArray((replyMarkup as InlineKeyboard).inline_keyboard) &&
      (replyMarkup as InlineKeyboard).inline_keyboard.some((row) =>
        row.some((button) => Boolean(button.style)),
      ),
  );
}

export function shouldRetryTelegramWithoutCustomEmoji(
  error: unknown,
  payload: Record<string, unknown>,
) {
  if (!(error instanceof TelegramApiError) || !error.responseReceived || error.statusCode !== 400) {
    return false;
  }
  const entityTextInvalid = payloadHasAnyEntities(payload) &&
    /(?:ENTITY_TEXT_INVALID|can't\s+parse\s+entities|entity\s+beginning\s+at)/i.test(error.message);
  const customEmojiFailure = payloadHasCustomEmoji(payload) &&
    /custom[_ -]?emoji|emoji.{0,40}(?:invalid|not found|can(?:not|'t)|not allowed|unavailable)|button[_ ]type[_ ]invalid|entity.{0,80}(?:utf-?16|middle of (?:a )?(?:utf-?16 )?symbol)/i.test(error.message);
  const styleFailure = payloadHasButtonStyle(payload) &&
    /style|button.{0,30}(?:invalid|unsupported|not allowed)/i.test(error.message);
  return entityTextInvalid || customEmojiFailure || styleFailure;
}

function payloadHasAnyEntities(payload: Record<string, unknown>) {
  const media = payload.media;
  const nestedCaptionEntities =
    media && typeof media === "object" && !Array.isArray(media)
      ? (media as Record<string, unknown>).caption_entities
      : undefined;
  return [payload.entities, payload.caption_entities, nestedCaptionEntities].some(
    (entities) => Array.isArray(entities) && entities.length > 0,
  );
}

function isTelegramEntityTextInvalid(error: unknown) {
  return error instanceof TelegramApiError &&
    error.responseReceived &&
    error.statusCode === 400 &&
    /(?:ENTITY_TEXT_INVALID|can't\s+parse\s+entities|entity\s+beginning\s+at)/i.test(error.message);
}

export function isTelegramEntityFormatError(error: unknown) {
  return isTelegramEntityTextInvalid(error);
}

async function telegramJson<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  try {
    return await telegramJsonOnce<T>(method, payload);
  } catch (error) {
    if (!shouldRetryTelegramWithoutCustomEmoji(error, payload)) throw error;
    const fallback = isTelegramEntityTextInvalid(error)
      ? telegramPayloadWithoutEntityFormatting(payload)
      : telegramPayloadWithoutCustomEmoji(payload);
    return telegramJsonOnce<T>(method, fallback);
  }
}

export async function sendMessage(
  chatId: string,
  text: string,
  replyMarkup?: InlineKeyboard,
  entities?: readonly TelegramMessageEntity[],
) {
  return telegramJson<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    ...(entities?.length ? { entities } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function editMessageText(input: {
  chatId: string;
  messageId: number;
  text: string;
  replyMarkup?: InlineKeyboard;
  entities?: readonly TelegramMessageEntity[];
}) {
  return telegramJson<{ message_id: number }>("editMessageText", {
    chat_id: input.chatId,
    message_id: input.messageId,
    text: input.text,
    ...(input.entities?.length ? { entities: input.entities } : {}),
    ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
  });
}

export async function sendPhoto(
  chatId: string,
  photo: string,
  caption: string,
  replyMarkup?: InlineKeyboard,
  captionEntities?: readonly TelegramMessageEntity[],
) {
  return telegramJson<{ message_id: number }>("sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    ...(captionEntities?.length ? { caption_entities: captionEntities } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function editMessageMedia(input: {
  chatId: string;
  messageId: number;
  photo: string;
  caption: string;
  replyMarkup?: InlineKeyboard;
  captionEntities?: readonly TelegramMessageEntity[];
}) {
  return telegramJson<{ message_id: number }>("editMessageMedia", {
    chat_id: input.chatId,
    message_id: input.messageId,
    media: {
      type: "photo",
      media: input.photo,
      caption: input.caption,
      ...(input.captionEntities?.length
        ? { caption_entities: input.captionEntities }
        : {}),
    },
    ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
  });
}

export async function editMessageCaption(input: {
  chatId: string;
  messageId: number;
  caption: string;
  replyMarkup?: InlineKeyboard;
  captionEntities?: readonly TelegramMessageEntity[];
}) {
  return telegramJson<{ message_id: number }>("editMessageCaption", {
    chat_id: input.chatId,
    message_id: input.messageId,
    caption: input.caption,
    ...(input.captionEntities?.length
      ? { caption_entities: input.captionEntities }
      : {}),
    ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
  });
}

export async function sendPhotoBuffer(input: {
  chatId: string;
  filename: string;
  png: Buffer;
  caption: string;
  replyMarkup?: InlineKeyboard;
  captionEntities?: readonly TelegramMessageEntity[];
}): Promise<{ message_id: number }> {
  const form = new FormData();
  form.set("chat_id", input.chatId);
  form.set("caption", input.caption);
  if (input.replyMarkup) {
    form.set("reply_markup", JSON.stringify(input.replyMarkup));
  }
  if (input.captionEntities?.length) {
    form.set("caption_entities", JSON.stringify(input.captionEntities));
  }
  form.set(
    "photo",
    new Blob([new Uint8Array(input.png)], { type: "image/png" }),
    input.filename,
  );

  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${requireEnv("TELEGRAM_BOT_TOKEN")}/sendPhoto`,
      { method: "POST", body: form, cache: "no-store" },
    );
  } catch {
    throw new TelegramApiError("Telegram photo outcome is unknown", false);
  }

  const data = (await response.json().catch(() => ({ ok: false }))) as TelegramResponse<{
    message_id: number;
  }>;
  if (!response.ok || !data.ok || !data.result) {
    const statusCode = data.error_code ?? response.status;
    throw new TelegramApiError(
      `Telegram rejected sendPhoto: ${statusCode} ${data.description ?? "unknown error"}`,
      true,
      data.parameters?.retry_after,
      retryableTelegramStatus(statusCode),
      statusCode,
    );
  }
  return data.result;
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return telegramJson<boolean>("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export async function getChatMember(chatId: string, userId: number) {
  return telegramJson<{
    status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
    is_member?: boolean;
  }>("getChatMember", {
    chat_id: chatId,
    user_id: userId,
  });
}

export async function deleteMessage(chatId: string, messageId: number) {
  return telegramJson<boolean>("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
}

export async function downloadTelegramDocument(input: {
  document: TelegramDocument;
  maxBytes: number;
}): Promise<Buffer> {
  if (
    input.document.file_size !== undefined &&
    input.document.file_size > input.maxBytes
  ) {
    throw new Error("File Telegram melebihi batas ukuran.");
  }
  const file = await telegramJson<{ file_path?: string }>("getFile", {
    file_id: input.document.file_id,
  });
  const filePath = file.file_path;
  if (
    !filePath ||
    filePath.includes("..") ||
    !/^[a-zA-Z0-9_./-]+$/.test(filePath)
  ) {
    throw new Error("Lokasi file Telegram tidak valid.");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/file/bot${requireEnv("TELEGRAM_BOT_TOKEN")}/${filePath}`,
      { cache: "no-store" },
    );
  } catch {
    throw new TelegramApiError("Telegram file download outcome is unknown", false);
  }
  if (!response.ok || !response.body) {
    throw new TelegramApiError(
      `Telegram file download failed with status ${response.status}`,
      true,
      undefined,
      retryableTelegramStatus(response.status),
      response.status,
    );
  }
  const contentLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
  if (contentLength > input.maxBytes) {
    await response.body.cancel().catch(() => undefined);
    throw new Error("File Telegram melebihi batas ukuran.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > input.maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("File Telegram melebihi batas ukuran.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

type SendDocumentInput = {
  chatId: string;
  filename: string;
  fileContent: Buffer | string;
  caption: string;
  replyMarkup?: InlineKeyboard;
  captionEntities?: readonly TelegramMessageEntity[];
};

async function sendDocumentOnce(
  input: SendDocumentInput,
): Promise<{ message_id: number }> {
  const form = new FormData();
  form.set("chat_id", input.chatId);
  form.set("caption", input.caption);
  if (input.captionEntities?.length) {
    form.set("caption_entities", JSON.stringify(input.captionEntities));
  }
  if (input.replyMarkup) {
    form.set("reply_markup", JSON.stringify(input.replyMarkup));
  }
  form.set(
    "document",
    new Blob(
      [
        typeof input.fileContent === "string"
          ? input.fileContent
          : new Uint8Array(input.fileContent),
      ],
      { type: "application/octet-stream" },
    ),
    input.filename,
  );

  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${requireEnv("TELEGRAM_BOT_TOKEN")}/sendDocument`,
      { method: "POST", body: form, cache: "no-store" },
    );
  } catch (error) {
    const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
    throw new TelegramApiError(`Telegram document outcome is unknown${detail}`.slice(0, 500), false);
  }

  const data = (await response.json().catch(() => ({ ok: false }))) as TelegramResponse<{
    message_id: number;
  }>;
  if (!response.ok || !data.ok || !data.result) {
    const statusCode = data.error_code ?? response.status;
    throw new TelegramApiError(
      `Telegram rejected sendDocument: ${statusCode} ${data.description ?? "unknown error"}`,
      true,
      data.parameters?.retry_after,
      retryableTelegramStatus(statusCode),
      statusCode,
    );
  }
  return data.result;
}

// Replace an owned invoice with its credential document. Never retry an upload
// whose response is unknown: the delivery receipt worker handles that outcome.
export async function editInvoiceDocument(input: SendDocumentInput & { messageId: number }): Promise<{ message_id: number }> {
  const form = new FormData();
  form.set("chat_id", input.chatId);
  form.set("message_id", String(input.messageId));
  form.set("media", JSON.stringify({ type: "document", media: "attach://document", caption: input.caption }));
  form.set("reply_markup", JSON.stringify(input.replyMarkup ?? { inline_keyboard: [] }));
  form.set("document", new Blob([typeof input.fileContent === "string" ? input.fileContent : new Uint8Array(input.fileContent)], { type: "application/octet-stream" }), input.filename);
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${requireEnv("TELEGRAM_BOT_TOKEN")}/editMessageMedia`, { method: "POST", body: form, cache: "no-store" });
  } catch { throw new TelegramApiError("Telegram invoice document outcome is unknown", false); }
  let data: TelegramResponse<{ message_id: number }>;
  try { data = await response.json(); }
  catch { throw new TelegramApiError("Telegram invoice document response is unknown", false); }
  if (response.ok && data.ok && data.result?.message_id === input.messageId) return data.result;
  if (data.ok || !data.error_code) throw new TelegramApiError("Telegram invoice document outcome is unknown", false);
  throw new TelegramApiError(`Telegram rejected invoice edit: ${data.error_code} ${data.description ?? "unknown error"}`, true, data.parameters?.retry_after, retryableTelegramStatus(data.error_code), data.error_code);
}

export async function sendDocument(
  input: SendDocumentInput,
): Promise<{ message_id: number }> {
  const customEmojiPayload = {
    ...(input.captionEntities?.length
      ? { caption_entities: input.captionEntities }
      : {}),
    ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
  };
  try {
    return await sendDocumentOnce(input);
  } catch (error) {
    if (!shouldRetryTelegramWithoutCustomEmoji(error, customEmojiPayload)) {
      throw error;
    }
    const fallback = isTelegramEntityTextInvalid(error)
      ? telegramPayloadWithoutEntityFormatting(customEmojiPayload)
      : telegramPayloadWithoutCustomEmoji(customEmojiPayload);
    return sendDocumentOnce({
      ...input,
      captionEntities: fallback.caption_entities as
        | readonly TelegramMessageEntity[]
        | undefined,
      replyMarkup: fallback.reply_markup as InlineKeyboard | undefined,
    });
  }
}
