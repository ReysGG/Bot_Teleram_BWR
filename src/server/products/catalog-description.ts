import {
  normalizeTelegramRichTextDocument,
  sliceTelegramRichTextDocument,
  type TelegramRichTextDocument,
} from "@/lib/telegram-rich-text";
import type { TelegramLocale } from "@/server/telegram/i18n";

export const MAX_CATALOG_DESCRIPTION_LENGTH = 5_000;

export class CatalogDescriptionInputError extends Error {}

export function normalizeCatalogDescriptionContent(input: {
  description: unknown;
  entities: unknown;
}) {
  try {
    const document = normalizeTelegramRichTextDocument({
      text: input.description,
      entities: input.entities,
      minLength: 2,
      maxLength: MAX_CATALOG_DESCRIPTION_LENGTH,
    });
    return {
      description: document.text,
      descriptionEntities: document.entities,
    };
  } catch (error) {
    throw new CatalogDescriptionInputError(
      error instanceof Error ? error.message : "Format deskripsi katalog tidak valid",
    );
  }
}

export function normalizeOptionalEnglishCatalogDescriptionContent(input: {
  description: unknown;
  entities: unknown;
}) {
  const rawDescription = typeof input.description === "string"
    ? input.description.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim()
    : "";
  if (!rawDescription) {
    return {
      descriptionEn: null,
      descriptionEntitiesEn: [],
    };
  }

  try {
    const document = normalizeTelegramRichTextDocument({
      text: input.description,
      entities: input.entities,
      minLength: 2,
      maxLength: MAX_CATALOG_DESCRIPTION_LENGTH,
    });
    return {
      descriptionEn: document.text,
      descriptionEntitiesEn: document.entities,
    };
  } catch (error) {
    throw new CatalogDescriptionInputError(
      error instanceof Error ? error.message : "Format deskripsi English tidak valid",
    );
  }
}

export function localizedCatalogDescription(input: {
  locale: TelegramLocale;
  description: string;
  descriptionEntities: unknown;
  descriptionEn?: string | null;
  descriptionEntitiesEn?: unknown;
}) {
  const fallback = {
    description: input.description,
    descriptionEntities: input.descriptionEntities,
  };
  if (input.locale !== "en" || !input.descriptionEn?.trim()) return fallback;

  try {
    const document = normalizeTelegramRichTextDocument({
      text: input.descriptionEn,
      entities: input.descriptionEntitiesEn,
      minLength: 2,
      maxLength: MAX_CATALOG_DESCRIPTION_LENGTH,
    });
    return {
      description: document.text,
      descriptionEntities: document.entities,
    };
  } catch {
    // An incomplete or malformed translation must never hide the Indonesian catalog.
    return fallback;
  }
}

export function catalogDescriptionDocument(input: {
  description: string;
  entities: unknown;
  maxLength: number;
}): TelegramRichTextDocument {
  try {
    const normalized = normalizeTelegramRichTextDocument({
      text: input.description,
      entities: input.entities,
      minLength: 0,
      maxLength: MAX_CATALOG_DESCRIPTION_LENGTH,
    });
    return sliceTelegramRichTextDocument(normalized, input.maxLength);
  } catch {
    // A malformed legacy entity must not make the public catalog unusable.
    // Admin writes remain strict through normalizeCatalogDescriptionContent().
    return sliceTelegramRichTextDocument({
      text: input.description.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim(),
      entities: [],
    }, input.maxLength);
  }
}
