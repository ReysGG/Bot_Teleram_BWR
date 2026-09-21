import Link from "next/link";
import { PageHeading } from "@/components/site/page-heading";

export function CheckoutHeading({ productName, productSlug }: { productName: string; productSlug: string }) {
  return <PageHeading
    breadcrumbs={<><Link href="/shop">Shop</Link> / <Link href={`/products/${encodeURIComponent(productSlug)}`}>{productName}</Link> / Checkout</>}
    description="Sebelum bayar, yuk cek kembali produk, jumlah, dan metode pembayaran agar semuanya sudah sesuai."
    imageAlt="Ilustrasi keranjang untuk checkout"
    imageUrl="/headings/cart-heading.webp"
    imageFit="contain"
    imageTreatment="natural"
    title="Cek pesananmu dulu."
  />;
}
