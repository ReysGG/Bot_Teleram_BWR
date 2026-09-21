import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Telegram privacy boundary", () => {
  it("keeps group and channel updates outside commerce flow", () => {
    const source = readFileSync("src/server/telegram/flow.ts", "utf8");
    const boundary = source.slice(
      source.indexOf("export async function handleTelegramUpdate"),
    );

    expect(boundary).toContain("if (!isPrivateTelegramUpdate(update)) return;");
    expect(boundary.indexOf("if (!isPrivateTelegramUpdate(update)) return;")).toBeLessThan(
      boundary.indexOf("handleMessage(update.message)"),
    );
    expect(boundary).not.toContain("missingRequiredTelegramChannels");
  });
});
