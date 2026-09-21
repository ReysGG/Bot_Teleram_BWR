import { readFile, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { parse } from "dotenv";

const envArgument = process.argv.find((argument) => argument.startsWith("--env="));
const envPath = envArgument?.slice("--env=".length) || ".env.docker";
const bcryptPattern = /^\$2[aby]\$\d{2}\$.{53}$/;

let source;
try {
  source = await readFile(envPath, "utf8");
} catch {
  console.error(`Unable to read ${envPath}`);
  process.exit(1);
}

const env = parse(source);
const configured = env.ADMIN_PASSWORD_HASH?.trim();
if (!configured) {
  console.error("ADMIN_PASSWORD_HASH is empty");
  process.exit(1);
}

if (bcryptPattern.test(configured)) {
  console.log("ADMIN_PASSWORD_HASH is already a valid bcrypt hash");
  process.exit(0);
}

if (configured.length < 10) {
  console.error("Admin password must contain at least 10 characters");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(configured, 12);
const updated = source.replace(
  /^ADMIN_PASSWORD_HASH=.*$/m,
  `ADMIN_PASSWORD_HASH='${passwordHash}'`,
);
await writeFile(envPath, updated, "utf8");
console.log(`Admin password secured as bcrypt in ${envPath}`);
