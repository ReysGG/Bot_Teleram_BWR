import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production log safety", () => {
  it("rotates Docker logs in local and production Compose", () => {
    for (const file of ["docker-compose.yml", "deploy/docker-compose.production.yml"]) {
      const compose = readFileSync(file, "utf8");
      expect(compose).toContain("x-logging: &default-logging");
      expect(compose).toContain('max-size: "25m"');
      expect(compose).toContain('max-file: "3"');
      expect(compose.match(/logging: \*default-logging/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    }
  });

  it("removes custom authentication signatures from Caddy access logs", () => {
    const caddy = readFileSync("deploy/Caddyfile", "utf8");
    for (const header of [
      "X-Telegram-Bot-Api-Secret-Token",
      "X-Relay-Signature",
      "X-Bridge-Signature",
    ]) {
      expect(caddy).toContain(`request>headers>${header} delete`);
    }
  });
});
