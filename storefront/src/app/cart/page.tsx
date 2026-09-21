import { CartWorkspace } from "@/components/cart/cart-workspace";
import { loadCatalogSnapshot } from "@/lib/catalog-model";
import { auth } from "@clerk/nextjs/server";
import { AccountRequired } from "@/components/auth/account-required";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  if (!(await auth()).userId) return <AccountRequired label="Keranjang" returnTo="/cart" description="Masuk terlebih dahulu untuk melihat keranjang dan melanjutkan belanjamu." />;
  const catalog = await loadCatalogSnapshot();
  return <CartWorkspace products={catalog.products} />;
}
