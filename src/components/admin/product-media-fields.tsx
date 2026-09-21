/* eslint-disable @next/next/no-img-element */
"use client";

import { ImageUp, Paperclip, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

export function ProductMediaFields({
  imageUrl,
  attachmentOriginalFilename,
  onRemovalChange,
}: {
  imageUrl: string | null;
  attachmentOriginalFilename: string | null;
  onRemovalChange?: (value: { image: boolean; attachment: boolean }) => void;
}) {
  const [removeImage, setRemoveImage] = useState(false);
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [imageFilename, setImageFilename] = useState("");
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [attachmentFilename, setAttachmentFilename] = useState("");
  const externalImageUrl = imageUrl?.startsWith("data:image/") ? "" : imageUrl ?? "";
  const displayedImageUrl = selectedImagePreview ?? (!removeImage ? imageUrl : null);

  useEffect(() => {
    return () => {
      if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview);
    };
  }, [selectedImagePreview]);

  function updateRemoval(next: { image?: boolean; attachment?: boolean }) {
    const image = next.image ?? removeImage;
    const attachment = next.attachment ?? removeAttachment;
    if (next.image !== undefined) setRemoveImage(image);
    if (next.attachment !== undefined) setRemoveAttachment(attachment);
    onRemovalChange?.({ image, attachment });
  }

  return (
    <div className="product-media-fields">
      <div className="product-media-heading">
        <div>
          <p className="eyebrow">Media produk</p>
          <strong>Gambar dan panduan</strong>
        </div>
        <span className="muted">File baru menggantikan file lama setelah konfirmasi.</span>
      </div>

      {displayedImageUrl ? (
        <div className="product-image-preview">
          <img alt="Preview gambar produk" src={displayedImageUrl} />
          <div>
            <strong>{selectedImagePreview ? "Preview gambar baru" : "Gambar produk saat ini"}</strong>
            <small>
              {selectedImagePreview
                ? `${imageFilename} · disimpan setelah konfirmasi`
                : imageUrl?.startsWith("data:image/")
                  ? "Upload tersimpan"
                  : "URL eksternal"}
            </small>
          </div>
        </div>
      ) : null}

      <div className="split-fields">
        <label>
          <span className="label-with-icon"><ImageUp aria-hidden="true" size={16} /> Upload gambar</span>
          <input
            accept="image/png,image/jpeg,image/webp,image/gif"
            name="image"
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              setImageFilename(file?.name ?? "");
              setSelectedImagePreview(file ? URL.createObjectURL(file) : null);
              if (file && removeImage) updateRemoval({ image: false });
            }}
          />
          <small>{imageFilename || "PNG, JPG, WebP, atau GIF. Maksimal 3 MB."}</small>
        </label>
        <label>
          URL gambar alternatif
          <input
            defaultValue={externalImageUrl}
            name="imageUrl"
            placeholder="https://..."
            type="url"
          />
          <small>Kosongkan jika memakai upload file. Upload file selalu diprioritaskan.</small>
        </label>
      </div>

      {imageUrl ? (
        <label className="checkbox-row product-remove-media">
          <input
            checked={removeImage}
            name="removeImage"
            type="checkbox"
            onChange={(event) => {
              updateRemoval({ image: event.target.checked });
              if (event.target.checked) {
                setImageFilename("");
                setSelectedImagePreview(null);
              }
            }}
          />
          <Trash2 aria-hidden="true" size={16} />
          <span>Hapus gambar produk yang sekarang</span>
        </label>
      ) : null}

      <label>
        <span className="label-with-icon">
          <Paperclip aria-hidden="true" size={16} />
          File bonus/panduan opsional
        </span>
        <input
          accept=".pdf,.txt,.zip,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf,text/plain"
          name="attachment"
          type="file"
          onChange={(event) => {
            const filename = event.currentTarget.files?.[0]?.name ?? "";
            setAttachmentFilename(filename);
            if (filename && removeAttachment) updateRemoval({ attachment: false });
          }}
        />
        <small>
          {attachmentFilename || (attachmentOriginalFilename
            ? `Saat ini: ${attachmentOriginalFilename}. Pilih file baru untuk mengganti.`
            : "Contoh PDF panduan atau file bonus, maksimal 8 MB.")}
        </small>
      </label>

      {attachmentOriginalFilename ? (
        <label className="checkbox-row product-remove-media">
          <input
            checked={removeAttachment}
            name="removeAttachment"
            type="checkbox"
            onChange={(event) => updateRemoval({ attachment: event.target.checked })}
          />
          <Trash2 aria-hidden="true" size={16} />
          <span>Hapus panduan/lampiran yang sekarang</span>
        </label>
      ) : null}
    </div>
  );
}
