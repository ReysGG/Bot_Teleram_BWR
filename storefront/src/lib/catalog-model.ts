import { unstable_cache } from "next/cache";
import {
  storefrontApiStatus,
  storeApiRequest,
} from "@/lib/telegram-store-api";
import type {
  StorefrontCatalogSnapshot,
  StorefrontProduct,
  StorefrontProductGroup,
} from "@/lib/catalog-types";

const previewGroups: StorefrontProductGroup[] = [
  {
    id: "group-chatgpt",
    slug: "chatgpt",
    name: "ChatGPT",
    description: "Pilihan akun ChatGPT untuk kerja, belajar, dan kebutuhan tim.",
    imageUrl: null,
    productCount: 3,
    availableCount: 2,
    minPrice: 3_500,
  },
  {
    id: "group-claude",
    slug: "claude",
    name: "Claude",
    description: "Akun Claude untuk riset panjang, coding, dan penulisan.",
    imageUrl: null,
    productCount: 2,
    availableCount: 2,
    minPrice: 18_000,
  },
  {
    id: "group-productivity",
    slug: "productivity",
    name: "Produktivitas",
    description: "Tools digital untuk desain, dokumen, dan pekerjaan harian.",
    imageUrl: null,
    productCount: 2,
    availableCount: 1,
    minPrice: 12_000,
  },
  {
    id: "group-developer",
    slug: "developer-coding",
    name: "Developer & Coding",
    description: "Akses dan file digital untuk coding, automation, dan workflow developer.",
    imageUrl: null,
    productCount: 1,
    availableCount: 1,
    minPrice: 3_500,
  },
];

const previewProducts: StorefrontProduct[] = [
  {
    id: "product-chatgpt-business",
    slug: "chatgpt-business-1-bulan",
    name: "ChatGPT Business 1 Bulan",
    variantLabel: "Business 1 Bulan",
    description: "Akun siap pakai untuk akses fitur bisnis selama satu bulan.",
    price: 50_000,
    imageUrl: null,
    group: {
      id: "group-developer",
      slug: "developer-coding",
      name: "Developer & Coding",
      imageUrl: null,
    },
    readyStock: 25,
    reservedStock: 2,
    preorderEnabled: false,
    preorderEtaText: null,
    availability: "IN_STOCK",
    featured: true,
    tags: ["AI", "Business", "1 bulan"],
  },
  {
    id: "product-codex-json",
    slug: "chatgpt-codex-json-free",
    name: "ChatGPT Codex JSON Free Plan",
    variantLabel: "Codex JSON",
    description: "File JSON siap digunakan sesuai panduan delivery produk.",
    price: 3_500,
    imageUrl: null,
    group: { id: "group-chatgpt", slug: "chatgpt", name: "ChatGPT", imageUrl: null },
    readyStock: 182,
    reservedStock: 4,
    preorderEnabled: false,
    preorderEtaText: null,
    availability: "IN_STOCK",
    featured: true,
    tags: ["Codex", "JSON", "Developer"],
  },
  {
    id: "product-chatgpt-plus",
    slug: "chatgpt-plus-private",
    name: "ChatGPT Plus Private",
    variantLabel: "Plus Private",
    description: "Akun private dengan delivery otomatis setelah pembayaran.",
    price: 35_000,
    imageUrl: null,
    group: { id: "group-chatgpt", slug: "chatgpt", name: "ChatGPT", imageUrl: null },
    readyStock: 0,
    reservedStock: 0,
    preorderEnabled: true,
    preorderEtaText: "1-2 hari",
    availability: "PREORDER",
    featured: false,
    tags: ["AI", "Private", "Preorder"],
  },
  {
    id: "product-claude-pro",
    slug: "claude-pro-1-bulan",
    name: "Claude Pro 1 Bulan",
    variantLabel: "Pro 1 Bulan",
    description: "Untuk percakapan panjang, riset, dan workflow penulisan.",
    price: 42_000,
    imageUrl: null,
    group: { id: "group-claude", slug: "claude", name: "Claude", imageUrl: null },
    readyStock: 12,
    reservedStock: 1,
    preorderEnabled: false,
    preorderEtaText: null,
    availability: "IN_STOCK",
    featured: true,
    tags: ["AI", "Writing", "Research"],
  },
  {
    id: "product-claude-team",
    slug: "claude-team-seat",
    name: "Claude Team Seat",
    variantLabel: "Team Seat",
    description: "Seat tim dengan stok terbatas dan pengecekan otomatis.",
    price: 65_000,
    imageUrl: null,
    group: { id: "group-claude", slug: "claude", name: "Claude", imageUrl: null },
    readyStock: 3,
    reservedStock: 1,
    preorderEnabled: true,
    preorderEtaText: "24 jam",
    availability: "LOW_STOCK",
    featured: false,
    tags: ["AI", "Team", "Limited"],
  },
  {
    id: "product-canva",
    slug: "canva-pro-1-bulan",
    name: "Canva Pro 1 Bulan",
    variantLabel: "Pro 1 Bulan",
    description: "Akses desain untuk konten, presentasi, dan social media.",
    price: 12_000,
    imageUrl: null,
    group: {
      id: "group-productivity",
      slug: "productivity",
      name: "Produktivitas",
      imageUrl: null,
    },
    readyStock: 9,
    reservedStock: 0,
    preorderEnabled: false,
    preorderEtaText: null,
    availability: "IN_STOCK",
    featured: true,
    tags: ["Design", "Template", "Content"],
  },
  {
    id: "product-gemini",
    slug: "gemini-advanced",
    name: "Gemini Advanced",
    variantLabel: "Advanced",
    description: "Akun AI Google untuk produktivitas dan eksperimen multimodal.",
    price: 28_000,
    imageUrl: null,
    group: {
      id: "group-productivity",
      slug: "productivity",
      name: "Produktivitas",
      imageUrl: null,
    },
    readyStock: 0,
    reservedStock: 0,
    preorderEnabled: false,
    preorderEtaText: null,
    availability: "OUT_OF_STOCK",
    featured: false,
    tags: ["AI", "Google", "Multimodal"],
  },
];

export const previewCatalogSnapshot: StorefrontCatalogSnapshot = {
  source: "preview",
  generatedAt: "2026-09-14T00:00:00.000Z",
  groups: previewGroups,
  products: previewProducts,
  paymentMethods: [
    "Wallet",
    "QRIS",
    "Bank Jago",
    "Binance Pay",
    "USDT BEP20",
  ],
};

// Only public catalog loads are shared. Never use this map for account data.
const pendingCatalogRequests = new Map<string, Promise<StorefrontCatalogSnapshot>>();
function fetchCatalogOnce(baseUrl: string) {
  const current = pendingCatalogRequests.get(baseUrl);
  if (current) return current;
  const request = storeApiRequest<StorefrontCatalogSnapshot>("/api/storefront/v1/catalog")
    .finally(() => { if (pendingCatalogRequests.get(baseUrl) === request) pendingCatalogRequests.delete(baseUrl); });
  pendingCatalogRequests.set(baseUrl, request);
  return request;
}

const loadRemoteCatalog = (baseUrl: string) => unstable_cache(
  async () => fetchCatalogOnce(baseUrl),
  ["telegram-storefront-catalog-v4", baseUrl],
  { revalidate: 60, tags: ["telegram-storefront-catalog"] },
)();

export async function loadCatalogSnapshot(): Promise<StorefrontCatalogSnapshot> {
  if (process.env.STOREFRONT_PREVIEW_MODE === "true") {
    return previewCatalogSnapshot;
  }
  if (!storefrontApiStatus().configured) {
    return {
      source: "disconnected",
      generatedAt: new Date(0).toISOString(),
      groups: [],
      products: [],
      paymentMethods: [],
    };
  }
  try {
    const snapshot = await loadRemoteCatalog(storefrontApiStatus().baseUrl!);
    return { ...snapshot, source: "api" };
  } catch {
    return {
      source: "disconnected",
      generatedAt: new Date(0).toISOString(),
      groups: [],
      products: [],
      paymentMethods: [],
    };
  }
}
