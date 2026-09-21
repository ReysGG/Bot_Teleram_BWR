export type StorefrontAvailability =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "PREORDER"
  | "OUT_OF_STOCK";

export type StorefrontProductGroup = {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  productCount: number;
  availableCount: number;
  minPrice: number | null;
};

export type StorefrontProduct = {
  id: string;
  slug: string;
  name: string;
  variantLabel: string | null;
  description: string;
  price: number;
  imageUrl: string | null;
  group: {
    id: string;
    slug: string;
    name: string;
    imageUrl: string | null;
  } | null;
  readyStock: number;
  reservedStock: number;
  // Optional during rolling upgrades; missing statistics are never invented.
  soldCount?: number;
  preorderEnabled: boolean;
  preorderEtaText: string | null;
  availability: StorefrontAvailability;
  featured: boolean;
  tags: string[];
};

export type StorefrontCatalogSnapshot = {
  source: "api" | "preview" | "disconnected";
  generatedAt: string;
  groups: StorefrontProductGroup[];
  products: StorefrontProduct[];
  paymentMethods: string[];
};

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function productAvailabilityLabel(product: StorefrontProduct): string {
  if (product.availability === "PREORDER") {
    return product.preorderEtaText
      ? "Preorder " + product.preorderEtaText
      : "Preorder";
  }
  if (product.availability === "OUT_OF_STOCK") return "Stok habis";
  if (product.availability === "LOW_STOCK") return "Tersisa " + product.readyStock;
  return "Stok " + product.readyStock;
}

export function productCanEnterCart(product: StorefrontProduct): boolean {
  return product.readyStock > 0 || product.preorderEnabled;
}
