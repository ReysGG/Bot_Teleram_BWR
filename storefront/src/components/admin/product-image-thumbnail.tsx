/* eslint-disable @next/next/no-img-element */
"use client";

import { ImageIcon } from "lucide-react";
import { useState } from "react";

export function ProductImageThumbnail({
  productId,
  name,
}: {
  productId: string;
  name: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <span className="product-list-thumbnail" title={`Gambar ${name}`}>
      <ImageIcon className="product-list-thumbnail-fallback" aria-hidden="true" size={20} />
      {!failed ? (
        <img
          alt=""
          className={loaded ? "is-loaded" : ""}
          src={`/api/admin/products/${encodeURIComponent(productId)}/image`}
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
        />
      ) : null}
    </span>
  );
}
