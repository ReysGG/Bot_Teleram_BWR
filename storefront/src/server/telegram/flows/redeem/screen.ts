import type { InlineKeyboard } from "@/server/telegram/api";
import type { PendingRedeemBatch } from "@/server/redeem/service";

const TELEGRAM_ADMIN_ID = "7398144015";

export function buildRedeemScreen(
  pending: PendingRedeemBatch,
  description: string,
  notice?: string,
) {
  const rejected = pending.unmatchedCount + pending.invalidCount;
  return {
    text: [
      "🔐 AMBIL DATA LOGIN CODEX FREE",
      "",
      "Unggah file JSON Codex Free/9router yang sebelumnya kamu terima dari BWR Tele.",
      "Kamu bisa mengirim satu file, beberapa file satu per satu, atau satu JSON berisi banyak akun.",
      "Setelah semua file masuk, tekan Proses jadi TXT.",
      "",
      `Akun terverifikasi: ${pending.stockItemIds.length}`,
      `Tidak dapat diverifikasi: ${rejected}`,
      `Duplikat dilewati: ${pending.duplicateCount}`,
      ...(notice ? ["", notice] : []),
      "",
      "⚠️ Pemberitahuan penting",
      description,
      "",
      "Demi keamanan, bot hanya memproses akun yang benar-benar pernah dikirim ke Telegram ID ini.",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        ...(pending.stockItemIds.length > 0
          ? [[{
              text: `Proses ${pending.stockItemIds.length} akun jadi TXT`,
              callback_data: `k12_redeem_finish:${pending.batchId}`,
            }]]
          : []),
        [{
          text: "Kosongkan batch",
          callback_data: `k12_redeem_clear:${pending.batchId}`,
        }],
        [{ text: "☎️ Bantuan admin", url: `tg://user?id=${TELEGRAM_ADMIN_ID}` }],
        [{ text: "Kembali ke menu", callback_data: "k12_redeem_cancel" }],
      ],
    } satisfies InlineKeyboard,
  };
}
