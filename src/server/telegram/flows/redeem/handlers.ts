import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  addRedeemUpload,
  claimRedeemBatch,
  markRedeemBatchFailed,
  markRedeemBatchSent,
  newPendingRedeemBatch,
  parsePendingRedeemBatch,
  parseRedeemJson,
  prepareRedeemOutput,
  redeemOutputFilename,
  type PendingRedeemBatch,
} from "@/server/redeem/service";
import { getAccountRedeemSettings } from "@/server/redeem/settings";
import {
  accountRedeemVaultMissingNotice,
  syncAccountRedeemVaultReports,
} from "@/server/redeem/missing-report";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  deleteMessage,
  downloadTelegramDocument,
  sendDocument,
  TelegramApiError,
} from "@/server/telegram/api";
import { cleanError } from "@/server/utils/format";
import { buildRedeemScreen } from "./screen";
import type {
  RedeemDocumentMessage,
  RedeemFlowDependencies,
} from "./types";

export function createRedeemFlow(dependencies: RedeemFlowDependencies) {
  const { renderNavigationMessage, showMenu } = dependencies;

  async function renderScreen(
    chatId: string,
    pending: PendingRedeemBatch,
    notice?: string,
  ) {
    const settings = await getAccountRedeemSettings();
    const screen = buildRedeemScreen(pending, settings.description, notice);
    return renderNavigationMessage({
      chatId,
      messageId: pending.messageId,
      text: screen.text,
      replyMarkup: screen.replyMarkup,
    });
  }

  async function start(chatId: string, messageId?: number) {
    let pending = newPendingRedeemBatch(messageId ?? 0);
    const settings = await getAccountRedeemSettings();
    const screen = buildRedeemScreen(pending, settings.description);
    const rendered = await renderNavigationMessage({
      chatId,
      messageId,
      text: screen.text,
      replyMarkup: screen.replyMarkup,
    });
    pending = { ...pending, messageId: rendered.message_id };
    await prisma.botSession.upsert({
      where: { chatId },
      create: {
        chatId,
        state: "AWAITING_REDEEM_UPLOAD",
        cart: pending as unknown as Prisma.InputJsonValue,
        navigationMessageId: rendered.message_id,
      },
      update: {
        state: "AWAITING_REDEEM_UPLOAD",
        cart: pending as unknown as Prisma.InputJsonValue,
        navigationMessageId: rendered.message_id,
      },
    });
  }

  async function uploadDocument(message: RedeemDocumentMessage) {
    const chatId = String(message.chat.id);
    const document = message.document;
    if (!document) return;
    const initialSession = await prisma.botSession.findUnique({ where: { chatId } });
    if (
      initialSession?.state !== "AWAITING_REDEEM_UPLOAD" ||
      !parsePendingRedeemBatch(initialSession.cart)
    ) {
      throw new Error("Buka menu Ambil Data Login Codex Free sebelum mengupload JSON.");
    }
    if (!consumeRateLimit(`k12-redeem-upload:${chatId}`, 20, 10 * 60_000)) {
      throw new Error("Terlalu banyak file. Tunggu beberapa menit lalu coba lagi.");
    }
    const filename = document.file_name ?? "upload.json";
    if (!/\.json$/i.test(filename)) {
      throw new Error("Fitur ini hanya menerima file JSON Codex Free/9router.");
    }

    const content = await downloadTelegramDocument({
      document,
      maxBytes: 5 * 1024 * 1024,
    });
    const parsed = parseRedeemJson(content);
    let saved: PendingRedeemBatch | null = null;
    let fileMatched = 0;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const session = await prisma.botSession.findUnique({
        where: { chatId },
        select: { state: true, cart: true, updatedAt: true },
      });
      const pending = session?.state === "AWAITING_REDEEM_UPLOAD"
        ? parsePendingRedeemBatch(session.cart)
        : null;
      if (!session || !pending) {
        throw new Error("Buka menu Ambil Data Login Codex Free sebelum mengupload JSON.");
      }
      const result = await addRedeemUpload({ chatId, pending, parsed });
      const updated = await prisma.botSession.updateMany({
        where: {
          chatId,
          state: "AWAITING_REDEEM_UPLOAD",
          updatedAt: session.updatedAt,
        },
        data: { cart: result.pending as unknown as Prisma.InputJsonValue },
      });
      if (updated.count === 1) {
        saved = result.pending;
        fileMatched = result.matched;
        break;
      }
    }
    if (!saved) {
      throw new Error("Upload bersamaan belum dapat digabung. Kirim ulang file terakhir.");
    }
    await deleteMessage(chatId, message.message_id).catch(() => undefined);
    await renderScreen(
      chatId,
      saved,
      fileMatched > 0
        ? `${fileMatched} akun dari ${filename} ditambahkan ke batch.`
        : `Tidak ada akun dari ${filename} yang dapat diverifikasi.`,
    );
  }

  async function handleDocument(message: RedeemDocumentMessage) {
    const chatId = String(message.chat.id);
    try {
      await uploadDocument(message);
    } catch (error) {
      const session = await prisma.botSession.findUnique({ where: { chatId } });
      const pending = session?.state === "AWAITING_REDEEM_UPLOAD"
        ? parsePendingRedeemBatch(session.cart)
        : null;
      const rawMessage = error instanceof Error
        ? error.message
        : "File belum dapat diproses.";
      const safeMessage = /^(File|Redeem|Buka|Terlalu|Total|Upload|Maksimal)/.test(rawMessage)
        ? rawMessage
        : "File belum dapat diproses. Pastikan JSON Codex Free valid dan coba lagi.";
      await deleteMessage(chatId, message.message_id).catch(() => undefined);
      if (pending) await renderScreen(chatId, pending, safeMessage);
      else await showMenu(chatId, undefined, safeMessage);
    }
  }

  async function finish(
    chatId: string,
    callbackBatchId: string,
    messageId: number,
  ) {
    const session = await prisma.botSession.findUnique({ where: { chatId } });
    const pending = session?.state === "AWAITING_REDEEM_UPLOAD"
      ? parsePendingRedeemBatch(session.cart)
      : null;
    if (!pending || pending.batchId !== callbackBatchId) {
      throw new Error("Batch redeem sudah berubah atau kedaluwarsa.");
    }
    if (pending.stockItemIds.length === 0) {
      return renderScreen(chatId, pending, "Belum ada akun yang terverifikasi.");
    }
    await renderNavigationMessage({
      chatId,
      messageId,
      text: "Sedang memvalidasi ulang kepemilikan dan menyiapkan satu file TXT terenkripsi dari vault...",
    });

    const output = await prepareRedeemOutput({ chatId, pending });
    await syncAccountRedeemVaultReports({
      chatId,
      missing: output.missing,
      resolvedStockItemIds: output.units.map((unit) => unit.stockItemId),
    });
    if (output.units.length === 0) {
      return renderScreen(
        chatId,
        pending,
        accountRedeemVaultMissingNotice(output.missingMappings),
      );
    }
    const claimed = await claimRedeemBatch({
      pending,
      chatId,
      matchedCount: output.units.length,
    });
    if (!claimed) {
      await prisma.botSession.updateMany({
        where: { chatId },
        data: { state: "BROWSING", cart: Prisma.JsonNull },
      });
      return showMenu(
        chatId,
        messageId,
        "Batch ini sudah pernah diproses. File tidak dikirim ulang otomatis.",
      );
    }

    let sent: { message_id: number };
    try {
      sent = await sendDocument({
        chatId,
        filename: redeemOutputFilename(output.units.length),
        fileContent: output.content,
        caption: [
          `${output.units.length} data login berhasil diverifikasi dan digabung menjadi satu TXT.`,
          ...(output.missingMappings > 0
            ? [`${output.missingMappings} akun belum memiliki data login di vault.`]
            : []),
          "Simpan file dengan aman dan jangan teruskan ke pihak lain.",
        ].join("\n"),
        replyMarkup: {
          inline_keyboard: [
            [{ text: "Claim akun lain", callback_data: "k12_redeem" }],
            [{ text: "Kembali ke menu", callback_data: "menu" }],
          ],
        },
      });
    } catch (error) {
      await markRedeemBatchFailed({
        batchId: pending.batchId,
        ambiguous: error instanceof TelegramApiError && !error.responseReceived,
        error: cleanError(error),
      });
      throw error;
    }

    try {
      await markRedeemBatchSent({
        batchId: pending.batchId,
        chatId,
        telegramMessageId: sent.message_id,
        units: output.units,
      });
    } catch (error) {
      await markRedeemBatchFailed({
        batchId: pending.batchId,
        ambiguous: true,
        error: `File terkirim tetapi audit gagal: ${cleanError(error)}`,
      }).catch(() => undefined);
      throw new Error(
        "File sudah dikirim, tetapi audit perlu diperiksa admin. Jangan proses ulang batch ini.",
      );
    }

    await prisma.botSession.updateMany({
      where: { chatId },
      data: { state: "BROWSING", cart: Prisma.JsonNull },
    });
    return showMenu(
      chatId,
      messageId,
      [
        `${output.units.length} data login berhasil dikirim dalam satu file TXT.`,
        ...(output.missingMappings > 0
          ? [accountRedeemVaultMissingNotice(output.missingMappings)]
          : []),
      ].join("\n\n"),
    );
  }

  async function clear(chatId: string, callbackBatchId: string, messageId: number) {
    const session = await prisma.botSession.findUnique({ where: { chatId } });
    const pending = parsePendingRedeemBatch(session?.cart ?? null);
    if (!pending || pending.batchId !== callbackBatchId) {
      throw new Error("Batch redeem sudah berubah atau kedaluwarsa.");
    }
    await start(chatId, messageId);
  }

  async function cancel(chatId: string, messageId: number) {
    await prisma.botSession.updateMany({
      where: { chatId },
      data: { state: "BROWSING", cart: Prisma.JsonNull },
    });
    await showMenu(chatId, messageId);
  }

  return { cancel, clear, finish, handleDocument, renderScreen, start };
}
