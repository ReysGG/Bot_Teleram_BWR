import { sendMessage } from "@/server/telegram/api";
import {
  extractCustomEmojiId,
  isTelegramCustomEmojiKey,
  setTelegramCustomEmojiId,
  type TelegramCustomEmojiKey,
} from "@/server/telegram/custom-emoji";
import type { TelegramMessageEntity } from "@/server/telegram/types";

const PRODUCT_PRESENTATION_KEYS = [
  "chatgpt",
  "claude",
  "codex",
  "gemini",
  "canva",
  "sms",
  "json",
  "api",
  "catalog",
  "product",
] as const;

const SET_EMOJI_HELP = [
  "Atur custom emoji Telegram:",
  "/setemoji chatgpt <custom emoji>",
  "/setemoji claude <custom emoji>",
  "/setemoji <key> off",
  "",
  `Key: ${PRODUCT_PRESENTATION_KEYS.join(", ")}`,
  "",
  "Kirim emoji Premium asli, bukan gambar atau emoji Unicode biasa.",
].join("\n");

const KEY_LABELS: Record<TelegramCustomEmojiKey, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  canva: "Canva",
  sms: "SMS/OTP",
  json: "JSON/9Router",
  api: "API key",
  catalog: "Katalog",
  product: "Produk",
  cart: "Keranjang",
  stock: "Stok",
  payment: "Pembayaran",
  delivery: "Pengiriman",
  success: "Sukses",
  search: "Pencarian",
  back: "Kembali",
  home: "Menu utama",
  warning: "Peringatan",
  notification: "Notifikasi",
  preorder: "Preorder",
};

function parseKey(value?: string): TelegramCustomEmojiKey | null {
  const key = value?.trim().toLowerCase();
  return isTelegramCustomEmojiKey(key) &&
    (PRODUCT_PRESENTATION_KEYS as readonly string[]).includes(key)
    ? key
    : null;
}

export function shouldHandleSetEmojiCommand(
  command: string,
  isAdmin: boolean,
): boolean {
  return command === "/setemoji" && isAdmin;
}

export async function handleSetEmojiCommand(input: {
  chatId: string;
  text: string;
  entities?: TelegramMessageEntity[];
}): Promise<void> {
  const parts = input.text.trim().split(/\s+/);
  const requestedKey = parts[1];
  if (!requestedKey) {
    await sendMessage(input.chatId, SET_EMOJI_HELP);
    return;
  }

  const key = parseKey(requestedKey);
  if (!key) {
    await sendMessage(
      input.chatId,
      `Key "${requestedKey}" belum didukung.\n\n${SET_EMOJI_HELP}`,
    );
    return;
  }

  const clearing = parts[2]?.toLowerCase() === "off";
  const customEmojiId = clearing
    ? null
    : extractCustomEmojiId(input.entities ?? []);
  if (!clearing && !customEmojiId) {
    await sendMessage(
      input.chatId,
      `Custom emoji ${KEY_LABELS[key]} tidak terdeteksi. ` +
        "Pastikan emoji dikirim langsung dari daftar custom emoji Telegram Premium.\n\n" +
        SET_EMOJI_HELP,
    );
    return;
  }

  try {
    await setTelegramCustomEmojiId({
      key,
      id: clearing ? null : customEmojiId,
      actor: `telegram:${input.chatId}`,
    });
    await sendMessage(
      input.chatId,
      clearing
        ? `Custom emoji ${KEY_LABELS[key]} dinonaktifkan.`
        : `Custom emoji ${KEY_LABELS[key]} berhasil disimpan.\nID: ${customEmojiId}`,
    );
  } catch {
    await sendMessage(
      input.chatId,
      `Custom emoji ${KEY_LABELS[key]} gagal disimpan. Silakan coba lagi.`,
    );
  }
}
