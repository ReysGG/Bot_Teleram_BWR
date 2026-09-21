import { readFile } from "node:fs/promises";
import { parse } from "dotenv";

const envArgument = process.argv.find((argument) => argument.startsWith("--env="));
const envPath = envArgument?.slice("--env=".length) || ".env";
const shouldSetWebhook = process.argv.includes("--webhook");

let env;
try {
  env = parse(await readFile(envPath, "utf8"));
} catch {
  console.error(`Unable to read ${envPath}`);
  process.exit(1);
}

const token = env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not configured");
  process.exit(1);
}

const apiBase = `https://api.telegram.org/bot${token}`;

async function callTelegram(method, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${apiBase}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.description || `HTTP ${response.status}`);
    }
    return payload.result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Telegram API ${method} failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

try {
  const bot = await callTelegram("getMe");
  await callTelegram("setMyName", { name: "BWR Tele" });
  await callTelegram("setMyDescription", {
    description: "BWR Tele - belanja produk digital, atur saldo, dan pesan SMS OTP langsung di chat. Channel hanya untuk info stok, promo, dan kabar layanan.",
  });
  await callTelegram("setMyShortDescription", {
    short_description: "Produk digital, SMS OTP, wallet & referral.",
  });
  await callTelegram("setMyDescription", {
    description: "BWR Tele - buy digital products, manage your wallet, and order SMS OTP in chat. Channels share stock updates, promos, and service news.",
    language_code: "en",
  });
  await callTelegram("setMyShortDescription", {
    short_description: "Digital products, SMS OTP, wallet & referrals.",
    language_code: "en",
  });
  await callTelegram("setMyCommands", {
    commands: [
      { command: "start", description: "Buka menu utama" },
      { command: "catalog", description: "Lihat katalog produk" },
      { command: "sms", description: "Beli nomor SMS dan cek OTP" },
      { command: "orders", description: "Lihat order terbaru" },
      { command: "wallet", description: "Saldo dan top up" },
      { command: "redeem", description: "Ambil login Codex Free" },
      { command: "referral", description: "Kode, poin, dan claim referral" },
      { command: "help", description: "Bantuan dan komunitas" },
    ],
  });
  await callTelegram("setMyCommands", {
    language_code: "en",
    commands: [
      { command: "start", description: "Open the main menu" },
      { command: "catalog", description: "Browse digital products" },
      { command: "sms", description: "Buy SMS numbers and check OTP" },
      { command: "orders", description: "View recent orders" },
      { command: "wallet", description: "Wallet balance and top up" },
      { command: "redeem", description: "Get Codex Free login" },
      { command: "referral", description: "Referral code, points, and rewards" },
      { command: "help", description: "Help and community" },
    ],
  });

  console.log(`Bot verified: @${bot.username} (${bot.id})`);
  console.log("Telegram profile and command menu configured");

  if (shouldSetWebhook) {
    const appUrl = new URL(env.APP_URL);
    if (appUrl.protocol !== "https:") {
      throw new Error("APP_URL must use HTTPS before setting the Telegram webhook");
    }
    if (!env.TELEGRAM_WEBHOOK_SECRET) {
      throw new Error("TELEGRAM_WEBHOOK_SECRET is not configured");
    }
    const webhookUrl = new URL("/api/telegram/webhook", appUrl).toString();
    await callTelegram("setWebhook", {
      url: webhookUrl,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
    console.log(`Webhook configured: ${webhookUrl}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Telegram configuration failed");
  process.exit(1);
}
