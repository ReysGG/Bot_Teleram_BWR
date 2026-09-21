import { createHmac, randomUUID } from "node:crypto";

const baseArgument = process.argv.find((argument) => argument.startsWith("--base="));
const baseUrl = new URL(baseArgument?.slice("--base=".length) || process.env.APP_URL);
const secret = process.env.DANA_ANDROID_BRIDGE_SECRET?.trim();

if (!secret || secret.length < 32) {
  throw new Error("DANA_ANDROID_BRIDGE_SECRET is not configured");
}

async function signedPost(path, body) {
  const rawBody = JSON.stringify(body);
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Bridge-Timestamp": timestamp,
      "X-Bridge-Signature": signature,
    },
    body: rawBody,
  });
  const result = await response.json().catch(() => ({ ok: false }));
  return { status: response.status, result };
}

const deviceId = `android-json12-test-${randomUUID()}`;
const heartbeat = await signedPost("/api/bridge/android/heartbeat", {
  deviceId,
  queueSize: 0,
});
const notification = await signedPost("/api/bridge/android/notification", {
  eventId: `test-${randomUUID()}-${randomUUID()}`,
  deviceId,
  packageName: "id.dana",
  title: "Tes koneksi bridge JSON12",
  body: "Event diagnostik ini tidak mengonfirmasi pembayaran.",
  postedAt: new Date().toISOString(),
});

console.log(JSON.stringify({ heartbeat, notification }));
if (
  heartbeat.status !== 200 ||
  heartbeat.result?.status !== "alive" ||
  notification.status !== 200 ||
  notification.result?.status !== "ignored_content"
) {
  process.exitCode = 1;
}
