import { randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const envArgument = process.argv.find((argument) => argument.startsWith("--env="));
const envPath = resolve(envArgument?.slice("--env=".length) || ".env.docker");
const enabled = process.argv.includes("--enable");
const original = await readFile(envPath, "utf8");

function currentValue(name) {
  const match = original.match(new RegExp(`^${name}=["']?([^"'\\r\\n]*)`, "m"));
  return match?.[1]?.trim();
}

function setValue(content, name, value) {
  const line = `${name}="${value}"`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  return pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}\n${line}\n`;
}

const existingSecret = currentValue("DANA_ANDROID_BRIDGE_SECRET");
const providedSecret = process.env.DANA_ANDROID_BRIDGE_SECRET_OVERRIDE?.trim();
if (providedSecret && providedSecret.length < 32) {
  throw new Error("DANA_ANDROID_BRIDGE_SECRET_OVERRIDE must be at least 32 characters");
}
const reusableSecret =
  existingSecret &&
  existingSecret.length >= 32 &&
  !existingSecret.toLowerCase().includes("replace-with")
    ? existingSecret
    : undefined;
const secret = providedSecret || reusableSecret || randomBytes(32).toString("hex");

let updated = setValue(original, "DANA_ANDROID_BRIDGE_SECRET", secret);
updated = setValue(updated, "DANA_ANDROID_BRIDGE_ENABLED", String(enabled));
const temporaryPath = `${envPath}.android-bridge-tmp`;

await writeFile(temporaryPath, updated, { encoding: "utf8", mode: 0o600 });
await rename(temporaryPath, envPath);
console.log(`Android bridge configured in ${envPath}; enabled=${enabled}`);
