import { describe, expect, it } from "vitest";
import {
  formatAdminInlineStockText,
  MAX_ADMIN_INLINE_STOCK_BYTES,
} from "@/server/admin/orders/inline-stock-content";

describe("admin inline stock content", () => {
  it("keeps delivered TXT account content directly readable", () => {
    const text = "email@example.com|password|2FA-CODE\n";
    expect(formatAdminInlineStockText("account.txt", Buffer.from(text))).toEqual({
      kind: "text",
      text,
      byteLength: Buffer.byteLength(text),
    });
  });

  it("keeps script-like content as plain text for React to escape", () => {
    const text = '<script>alert("x")</script>';
    expect(formatAdminInlineStockText("account.txt", Buffer.from(text))).toEqual({
      kind: "text",
      text,
      byteLength: Buffer.byteLength(text),
    });
  });

  it("rejects unsupported, invalid UTF-8, control, empty, and oversized content", () => {
    expect(formatAdminInlineStockText("account.json", Buffer.from("{}"))).toEqual({
      kind: "unsupported",
    });
    expect(
      formatAdminInlineStockText("binary.txt", Buffer.from([0xc3, 0x28])),
    ).toEqual({ kind: "binary" });
    expect(formatAdminInlineStockText("control.txt", Buffer.from("user\0pass"))).toEqual({
      kind: "binary",
    });
    expect(formatAdminInlineStockText("empty.txt", Buffer.from(" \n"))).toEqual({
      kind: "binary",
    });
    expect(
      formatAdminInlineStockText(
        "large.txt",
        Buffer.alloc(MAX_ADMIN_INLINE_STOCK_BYTES + 1, 0x61),
      ),
    ).toEqual({ kind: "too-large" });
  });
});
