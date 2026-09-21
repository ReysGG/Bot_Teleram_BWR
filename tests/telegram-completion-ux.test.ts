import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Telegram purchase completion UX", () => {
  const worker = readFileSync("src/server/telegram/delivery-worker.ts", "utf8");

  it("keeps document delivery free from redundant acknowledgement controls", () => {
    expect(worker).not.toContain("Saya sudah menerima file");
    expect(worker).not.toContain("callback_data: `delivery_ack:");
  });

  it("updates the delivered document caption without creating a completion bubble", () => {
    const handler = worker.slice(
      worker.indexOf("export async function processProductPostDelivery"),
      worker.indexOf("async function processSuccessChannel"),
    );
    expect(handler).toContain("completedProductDeliveryDocument");
    expect(handler).toContain("editCompletionCaption({");
    expect(handler).not.toContain("sendNavigationNotification(");
    expect(handler).not.toContain("sendTextNotification(");
  });
});
