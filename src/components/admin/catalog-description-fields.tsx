"use client";

import { useRef } from "react";
import { TelegramRichTextEditor } from "@/components/admin/telegram-rich-text-editor";
import { MAX_CATALOG_DESCRIPTION_LENGTH } from "@/server/products/catalog-description";

export function CatalogDescriptionFields({
  description,
  entities,
  label = "Deskripsi katalog",
  placeholder = "Jelaskan produk, manfaat, format pengiriman, dan informasi penting untuk pembeli.",
  previewMode = "side",
  name = "description",
  entitiesName = "descriptionEntities",
  required = true,
  helpText = "Teks ini tampil di katalog dan dapat ikut dikirim pada pengumuman produk. Jangan masukkan credential, token, atau data internal.",
  onInvalid,
}: {
  description?: string | null;
  entities?: unknown;
  label?: string;
  placeholder?: string;
  previewMode?: "toggle" | "side" | "stack";
  name?: string;
  entitiesName?: string;
  required?: boolean;
  helpText?: string;
  onInvalid?: () => void;
}) {
  return (
    <TelegramRichTextEditor
      audience="public"
      entitiesName={entitiesName}
      helpText={helpText}
      initialEntities={entities}
      initialText={description}
      label={label}
      maxLength={MAX_CATALOG_DESCRIPTION_LENGTH}
      minLength={2}
      name={name}
      placeholder={placeholder}
      previewMode={previewMode}
      required={required}
      onInvalid={onInvalid}
    />
  );
}

export function LocalizedCatalogDescriptionFields({
  description,
  entities,
  descriptionEn,
  entitiesEn,
  subject = "produk",
  previewMode = "side",
}: {
  description?: string | null;
  entities?: unknown;
  descriptionEn?: string | null;
  entitiesEn?: unknown;
  subject?: "produk" | "grup";
  previewMode?: "toggle" | "side" | "stack";
}) {
  const englishDetailsRef = useRef<HTMLDetailsElement>(null);
  const subjectLabel = subject === "grup" ? "grup produk" : "produk";
  return (
    <div className="localized-catalog-description">
      <div className="localized-catalog-language-heading">
        <div>
          <span className="localized-catalog-language-code">ID</span>
          <div>
            <strong>Bahasa Indonesia</strong>
            <small>Wajib dan menjadi fallback untuk semua pembeli.</small>
          </div>
        </div>
        <span className="status-pill status-good">Utama</span>
      </div>
      <CatalogDescriptionFields
        description={description}
        entities={entities}
        label={`Deskripsi ${subjectLabel} - Indonesia`}
        placeholder={`Jelaskan ${subjectLabel}, manfaat, format pengiriman, dan informasi penting untuk pembeli.`}
        previewMode={previewMode}
      />

      <details
        ref={englishDetailsRef}
        className="localized-catalog-english"
        open={Boolean(descriptionEn?.trim())}
      >
        <summary>
          <span className="localized-catalog-language-code">EN</span>
          <span>
            <strong>English description</strong>
            <small>Optional. Indonesian is used automatically when this is empty.</small>
          </span>
          <span className="status-pill status-neutral">Optional</span>
        </summary>
        <div className="localized-catalog-english-editor">
          <CatalogDescriptionFields
            description={descriptionEn}
            entities={entitiesEn}
            entitiesName="descriptionEntitiesEn"
            helpText="This public text is shown to buyers who select English. Review the translation before saving; never include credentials, tokens, or internal data."
            label={`English ${subjectLabel} description`}
            name="descriptionEn"
            placeholder={`Describe this ${subjectLabel} in English. Leave empty to use the Indonesian version.`}
            previewMode={previewMode}
            required={false}
            onInvalid={() => {
              if (englishDetailsRef.current) englishDetailsRef.current.open = true;
            }}
          />
        </div>
      </details>
      <p className="fine-print localized-catalog-translation-note">
        Deskripsi English bersifat opsional. Jika kosong, pembeli akan melihat deskripsi Bahasa Indonesia.
      </p>
    </div>
  );
}
