import { describe, expect, it } from "vitest";
import {
  CatalogDescriptionInputError,
  MAX_CATALOG_DESCRIPTION_LENGTH,
  catalogDescriptionDocument,
  localizedCatalogDescription,
  normalizeCatalogDescriptionContent,
  normalizeOptionalEnglishCatalogDescriptionContent,
} from "@/server/products/catalog-description";

describe("catalog rich descriptions", () => {
  it("normalizes readable text with validated Telegram styles and links", () => {
    expect(normalizeCatalogDescriptionContent({
      description: "  Buka akun  ",
      entities: JSON.stringify([
        { type: "bold", offset: 2, length: 4 },
        {
          type: "text_link",
          offset: 7,
          length: 4,
          url: "https://example.test/catalog",
        },
      ]),
    })).toEqual({
      description: "Buka akun",
      descriptionEntities: [
        { type: "bold", offset: 0, length: 4 },
        {
          type: "text_link",
          offset: 5,
          length: 4,
          url: "https://example.test/catalog",
        },
      ],
    });
  });

  it("keeps legacy plain descriptions compatible with an empty entity list", () => {
    expect(normalizeCatalogDescriptionContent({
      description: "Deskripsi lama",
      entities: undefined,
    })).toEqual({
      description: "Deskripsi lama",
      descriptionEntities: [],
    });
  });

  it("stores optional English rich text separately and keeps an empty translation nullable", () => {
    expect(normalizeOptionalEnglishCatalogDescriptionContent({
      description: "  Open account  ",
      entities: JSON.stringify([{ type: "bold", offset: 2, length: 4 }]),
    })).toEqual({
      descriptionEn: "Open account",
      descriptionEntitiesEn: [{ type: "bold", offset: 0, length: 4 }],
    });
    expect(normalizeOptionalEnglishCatalogDescriptionContent({
      description: "   ",
      entities: "[]",
    })).toEqual({
      descriptionEn: null,
      descriptionEntitiesEn: [],
    });
  });

  it("selects English only when the complete translation is valid", () => {
    const base = {
      description: "Deskripsi Indonesia",
      descriptionEntities: [{ type: "bold", offset: 0, length: 9 }],
      descriptionEn: "English description",
      descriptionEntitiesEn: [{ type: "italic", offset: 0, length: 7 }],
    };
    expect(localizedCatalogDescription({ locale: "en", ...base })).toEqual({
      description: "English description",
      descriptionEntities: [{ type: "italic", offset: 0, length: 7 }],
    });
    expect(localizedCatalogDescription({ locale: "id", ...base })).toEqual({
      description: "Deskripsi Indonesia",
      descriptionEntities: [{ type: "bold", offset: 0, length: 9 }],
    });
    expect(localizedCatalogDescription({
      locale: "en",
      ...base,
      descriptionEntitiesEn: [{ type: "bold", offset: 999, length: 4 }],
    })).toEqual({
      description: "Deskripsi Indonesia",
      descriptionEntities: [{ type: "bold", offset: 0, length: 9 }],
    });
  });

  it("renders malformed persisted formatter data as plain text", () => {
    expect(catalogDescriptionDocument({
      description: "Deskripsi produk lama",
      entities: [{ type: "bold", offset: 500, length: 4 }],
      maxLength: 900,
    })).toEqual({
      text: "Deskripsi produk lama",
      entities: [],
    });
  });

  it("keeps legacy CRLF and oversized descriptions available as bounded plain text", () => {
    const document = catalogDescriptionDocument({
      description: `Baris satu\r\n${"x".repeat(MAX_CATALOG_DESCRIPTION_LENGTH + 50)}`,
      entities: [{ type: "bold", offset: 99_999, length: 4 }],
      maxLength: 24,
    });

    expect(document.text).toBe("Baris satu\nxxxxxxxxxxxxx");
    expect(document.entities).toEqual([]);
  });

  it("rejects unsafe links and crossing entities as catalog input errors", () => {
    expect(() => normalizeCatalogDescriptionContent({
      description: "Buka situs",
      entities: [{
        type: "text_link",
        offset: 0,
        length: 4,
        url: "http://unsafe.example.test",
      }],
    })).toThrow(CatalogDescriptionInputError);

    expect(() => normalizeCatalogDescriptionContent({
      description: "abcdefghij",
      entities: [
        { type: "bold", offset: 0, length: 6 },
        { type: "italic", offset: 4, length: 6 },
      ],
    })).toThrow("menyilang");

    expect(() => normalizeOptionalEnglishCatalogDescriptionContent({
      description: "Open site",
      entities: [{
        type: "text_link",
        offset: 0,
        length: 4,
        url: "http://unsafe.example.test",
      }],
    })).toThrow(CatalogDescriptionInputError);
  });

  it("enforces the catalog description length policy", () => {
    expect(() => normalizeCatalogDescriptionContent({
      description: "A",
      entities: [],
    })).toThrow("2-5000");
    expect(() => normalizeCatalogDescriptionContent({
      description: "x".repeat(MAX_CATALOG_DESCRIPTION_LENGTH + 1),
      entities: [],
    })).toThrow("2-5000");
  });

  it("returns a bounded document for Telegram presentation", () => {
    expect(catalogDescriptionDocument({
      description: "Promosi katalog panjang",
      entities: [
        { type: "bold", offset: 0, length: 22 },
        { type: "italic", offset: 16, length: 6 },
      ],
      maxLength: 16,
    })).toEqual({
      text: "Promosi katalog",
      entities: [{ type: "bold", offset: 0, length: 15 }],
    });
  });
});
