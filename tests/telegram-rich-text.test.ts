import { describe, expect, it } from "vitest";
import {
  composeTelegramRichText,
  normalizeTelegramRichTextDocument,
  shiftTelegramRichTextEntities,
  sliceTelegramRichTextDocument,
  telegramRichTextToSafeHtml,
} from "@/lib/telegram-rich-text";
import { adminBroadcastTelegramDocument } from "@/server/telegram/admin-broadcast";

describe("Telegram rich-text documents", () => {
  it("keeps UTF-16 offsets while trimming and supports safe nested styles", () => {
    const document = normalizeTelegramRichTextDocument({
      text: "  🤖 ChatGPT CDK  ",
      entities: JSON.stringify([
        { type: "bold", offset: 5, length: 12 },
        { type: "italic", offset: 5, length: 7 },
      ]),
      maxLength: 100,
    });

    expect(document).toEqual({
      text: "🤖 ChatGPT CDK",
      entities: [
        { type: "bold", offset: 3, length: 11 },
        { type: "italic", offset: 3, length: 7 },
      ],
    });
  });

  it("rejects crossing entities, code overlap, and unsafe links", () => {
    expect(() => normalizeTelegramRichTextDocument({
      text: "abcdefghij",
      entities: [
        { type: "bold", offset: 0, length: 6 },
        { type: "italic", offset: 4, length: 6 },
      ],
      maxLength: 100,
    })).toThrow("menyilang");

    expect(() => normalizeTelegramRichTextDocument({
      text: "abcdefghij",
      entities: [
        { type: "code", offset: 0, length: 10 },
        { type: "bold", offset: 2, length: 4 },
      ],
      maxLength: 100,
    })).toThrow("code");

    expect(() => normalizeTelegramRichTextDocument({
      text: "Buka situs",
      entities: [
        { type: "text_link", offset: 0, length: 10, url: "javascript:alert(1)" },
      ],
      maxLength: 100,
    })).toThrow("HTTPS");
  });

  it("rejects entity boundaries inside an emoji surrogate pair", () => {
    const text = "\u{1F916} Bot";
    expect(() => normalizeTelegramRichTextDocument({
      text,
      entities: [{ type: "bold", offset: 1, length: 1 }],
      maxLength: 100,
    })).toThrow("emoji");
    expect(() => normalizeTelegramRichTextDocument({
      text,
      entities: [{ type: "bold", offset: 0, length: 1 }],
      maxLength: 100,
    })).toThrow("emoji");
    expect(normalizeTelegramRichTextDocument({
      text,
      entities: [{ type: "bold", offset: 0, length: 2 }],
      maxLength: 100,
    }).entities).toEqual([{ type: "bold", offset: 0, length: 2 }]);
  });

  it("canonicalizes form CRLF before validating LF-based entity offsets", () => {
    expect(normalizeTelegramRichTextDocument({
      text: "Baris satu\r\nBaris dua",
      entities: [{ type: "bold", offset: 11, length: 9 }],
      maxLength: 100,
    })).toEqual({
      text: "Baris satu\nBaris dua",
      entities: [{ type: "bold", offset: 11, length: 9 }],
    });
  });

  it("renders an escaped admin preview instead of executable HTML", () => {
    const html = telegramRichTextToSafeHtml({
      text: "<script>alert(1)</script> Buka",
      entities: [{
        type: "text_link",
        offset: 26,
        length: 4,
        url: "https://example.test/",
      }],
    });

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain('href="https://example.test/"');
    expect(html).not.toContain("<script>");
  });

  it("composes and shifts reusable Telegram entity documents", () => {
    expect(shiftTelegramRichTextEntities([
      { type: "bold", offset: 0, length: 4 },
    ], 3)).toEqual([{ type: "bold", offset: 3, length: 4 }]);
    expect(composeTelegramRichText([
      { text: "A: ", entities: [] },
      { text: "test", entities: [{ type: "bold", offset: 0, length: 4 }] },
    ])).toEqual({
      text: "A: test",
      entities: [{ type: "bold", offset: 3, length: 4 }],
    });
  });

  it("truncates without splitting emoji and clips entities to the retained text", () => {
    const document = normalizeTelegramRichTextDocument({
      text: "AB\u{1F916}CDEF",
      entities: [
        { type: "bold", offset: 0, length: 8 },
        { type: "italic", offset: 4, length: 4 },
      ],
      maxLength: 100,
    });

    expect(sliceTelegramRichTextDocument(document, 3)).toEqual({
      text: "AB",
      entities: [{ type: "bold", offset: 0, length: 2 }],
    });
    expect(sliceTelegramRichTextDocument(document, 6)).toEqual({
      text: "AB\u{1F916}CD",
      entities: [
        { type: "bold", offset: 0, length: 6 },
        { type: "italic", offset: 4, length: 2 },
      ],
    });
  });

  it("converts a formatted website broadcast into Telegram text entities", () => {
    const document = adminBroadcastTelegramDocument({
      title: "Promo CDK",
      messageText: "Gunakan kode HEMAT",
      messageEntities: [
        { type: "bold", offset: 13, length: 5 },
      ],
    });

    expect(document.text).toContain("📌 Promo CDK");
    expect(document.text).toContain("Gunakan kode HEMAT");
    expect(document.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "bold", length: 9 }),
      expect.objectContaining({ type: "bold", length: 5 }),
    ]));
  });
});
