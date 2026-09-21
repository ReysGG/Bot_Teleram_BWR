import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const envArgument = process.argv.find((argument) => argument.startsWith("--env="));
const envPath = resolve(envArgument?.slice("--env=".length) || ".env.docker");
const payload = process.env.QRIS_PAYLOAD?.trim();

if (!payload || !/^000201/.test(payload) || !/6304[0-9A-Fa-f]{4}$/.test(payload)) {
  throw new Error("QRIS_PAYLOAD must contain a decoded EMV QRIS payload");
}

const original = await readFile(envPath, "utf8");
const line = `PAYMENT_QRIS_BASE_PAYLOAD="${payload}"`;
const updated = /^PAYMENT_QRIS_BASE_PAYLOAD=.*$/m.test(original)
  ? original.replace(/^PAYMENT_QRIS_BASE_PAYLOAD=.*$/m, line)
  : `${original.trimEnd()}\n${line}\n`;
const temporaryPath = `${envPath}.qris-tmp`;

await writeFile(temporaryPath, updated, { encoding: "utf8", mode: 0o600 });
await rename(temporaryPath, envPath);
console.log(`QRIS base payload configured in ${envPath}`);
