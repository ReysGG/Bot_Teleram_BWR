import { describe, expect, it } from "vitest";
import {
  adminMessageTelegramDocument,
  parseAdminMessageSnapshot,
  serializeAdminMessageSnapshot,
} from "@/server/telegram/admin-message";

describe("formatted admin buyer messages", () => {
  it("snapshots formatter entities and shifts them after the order header", () => {
    const snapshot = parseAdminMessageSnapshot(serializeAdminMessageSnapshot({
      text: "Silakan redeem sekarang",
      entities: [{ type: "bold", offset: 8, length: 6 }],
    }));
    expect(snapshot).not.toBeNull();

    const document = adminMessageTelegramDocument({
      invoiceNumber: "TGS-123",
      snapshot: snapshot!,
    });

    expect(document.text).toContain("TGS-123");
    expect(document.text).toContain("Silakan redeem sekarang");
    expect(document.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "code", length: 7 }),
      expect.objectContaining({ type: "bold", length: 6 }),
    ]));
  });

  it("keeps legacy plain admin messages readable", () => {
    expect(parseAdminMessageSnapshot("Pesan admin lama")).toEqual({
      text: "Pesan admin lama",
      entities: [],
    });
  });
});
