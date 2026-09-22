import Link from "next/link";
import { CategoryCard } from "@/components/catalog/category-card";
import { PageHeading } from "@/components/site/page-heading";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { loadCatalogSnapshot } from "@/lib/catalog-model";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const catalog = await loadCatalogSnapshot();
  return (
    <>
      <SiteHeader active="categories" />
      <main className="storefront-main">
        <PageHeading
          breadcrumbs={<><Link href="/">Home</Link> / Kategori</>}
          description="Temukan produk digital berdasarkan kebutuhanmu, lalu pilih produk dan varian yang paling sesuai."
          imageAlt="Ilustrasi kategori produk digital"
          imageFit="contain"
          imageMode="background"
          imageTreatment="natural"
          imageUrl="/headings/category-heading-banner.webp"
          title="Pilih kategori produk."
        />
        <div className="category-list page-width">
          {catalog.groups.map((group, index) => <CategoryCard group={group} index={index} key={group.id} />)}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
