const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const webhook = process.env.LOCAL_WEBHOOK_URL ?? "http://app:3000/api/telegram/webhook";
if (!token || !secret) throw new Error("local bot credentials are required");
if (token.split(":")[0] === "8875520688" || process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").toLowerCase() === "k12jsonstockbot") {
  throw new Error("Production bot K12JsonStockBot is forbidden in local testing");
}
if (process.env.LOCAL_TEST_BOT_CONFIRMED !== "true") throw new Error("A separate testing bot must be verified before polling");
let offset = 0;
const api = (method, body) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}).then(async (response) => { const value = await response.json(); if (!response.ok || !value.ok) throw new Error(`${method} failed`); return value.result; });
const identity = await api("getMe", {});
if (String(identity.id) === "8875520688" || identity.username !== process.env.TELEGRAM_BOT_USERNAME) throw new Error("Testing bot identity mismatch");
const info = await api("getWebhookInfo", {});
if (info.url) throw new Error("Existing webhook detected; local poller will not change it");
while (true) {
  try {
    const updates = await api("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
    for (const update of updates) {
      const result = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify(update) });
      if (!result.ok) throw new Error("Local webhook rejected update; cursor retained");
      offset = Math.max(offset, update.update_id + 1);
    }
  } catch { await new Promise((resolve) => setTimeout(resolve, 3000)); }
}
