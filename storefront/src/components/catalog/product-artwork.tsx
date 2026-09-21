import Image from "next/image";
import type { StorefrontProduct } from "@/lib/catalog-types";

export function ProductArtwork({
  product,
  size = "card",
}: {
  product: Pick<StorefrontProduct, "name" | "imageUrl"> & Partial<Pick<StorefrontProduct, "availability">>;
  size?: "card" | "detail" | "mini";
}) {
  const fallback = !product.imageUrl;
  return (
    <div className={`product-artwork artwork-${size}${fallback ? " product-artwork-fallback" : ""}${product.availability === "OUT_OF_STOCK" ? " product-artwork-sold-out" : ""}`}>
      <Image
        alt={product.name}
        draggable={false}
        fill
        sizes={
          size === "detail"
            ? "(max-width: 800px) calc(100vw - 32px), 520px"
            : size === "mini"
              ? "(max-width: 560px) 64px, 112px"
              : "(max-width: 800px) 45vw, (max-width: 1200px) 25vw, 320px"
        }
        src={product.imageUrl || "/placeholders/product-fallback.webp"}
        unoptimized={Boolean(product.imageUrl && !product.imageUrl.startsWith("/placeholders/"))}
      />
    </div>
  );
}
