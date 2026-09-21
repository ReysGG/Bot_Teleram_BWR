const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const webhook = process.env.LOCAL_WEBHOOK_URL ?? "http://app:3000/api/telegram/webhook";
if (!token || !secret) throw new Error("local bot credentials are required");
let offset = 0;
const api = (method, body) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}).then(async (response) => { const value = await response.json(); if (!response.ok || !value.ok) throw new Error(`${method} failed`); return value.result; });
while (true) {
  try {
    const updates = await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1);
      await fetch(webhook, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(update) }).catch(() => undefined);
    }
  } catch { await new Promise((resolve) => setTimeout(resolve, 3000)); }
}
