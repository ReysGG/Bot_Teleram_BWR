import { CartSkeleton } from "@/components/cart/cart-skeleton";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeading } from "@/components/site/page-heading";
export default function LoadingCart() {
  return <><SiteHeader /><main className="storefront-main"><PageHeading title="Cek keranjangmu." description="Pastikan produk dan jumlahnya sudah sesuai sebelum kamu melanjutkan checkout." imageUrl="/headings/cart-heading.webp" imageFit="contain" imageMode="background" imageTreatment="natural" /><div className="page-width" style={{ paddingBlock: "20px 64px" }}><CartSkeleton /></div></main><SiteFooter /></>;
}
