import Link from "next/link";
import type { StorefrontProduct } from "@/lib/catalog-types";
import { formatRupiah, productAvailabilityLabel } from "@/lib/catalog-types";
import { AddToCartButton } from "@/components/catalog/add-to-cart-button";
import { ProductArtwork } from "@/components/catalog/product-artwork";
import { ProductSales } from "@/components/catalog/product-sales";

export function ProductCard({ product }: { product: StorefrontProduct }) {
  const productHref = "/products/" + product.slug;
  return (
    <article className="product-card">
      <Link aria-hidden="true" className="product-card-hit-area" href={productHref} prefetch={false} tabIndex={-1} />
      <Link className="product-card-art-link" href={productHref} prefetch={false}>
        <ProductArtwork product={product} />
      </Link>
      <div className="product-card-body">
        <Link className="product-category" title={product.group?.name ?? "Produk digital"} href={product.group ? "/categories/" + product.group.slug : "/shop"}>
          {product.group?.name ?? "Produk digital"}
        </Link>
        <Link className="product-card-title" href={productHref} prefetch={false}>
          {product.name}
        </Link>
        <p>{product.description}</p>
        <div className="product-card-footer">
          <strong>{formatRupiah(product.price)}</strong>
          <span className={"stock-pill stock-" + product.availability.toLowerCase()}>
            {productAvailabilityLabel(product)}
          </span>
        </div>
        <ProductSales count={product.soldCount} />
        <AddToCartButton compact product={product} />
      </div>
    </article>
  );
}
