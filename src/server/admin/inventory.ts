import { prisma } from "@/server/db/prisma";
import { isSellableStock, sellableStockWhere } from "@/server/stock/sellable";
import type { BannedStockPolicy } from "@/generated/prisma/enums";
import { booleanEnv } from "@/server/env";

const inventoryReturnPaths = new Set([
  "/admin/inventory/available",
  "/admin/inventory/sold",
  "/admin/inventory/banned",
  "/admin/inventory/banned-recovery",
  "/admin/inventory/archived",
]);
const productStockPathPattern = /^\/admin\/products\/[a-zA-Z0-9_-]{1,64}\/stock$/;
const inventoryReturnQueryKeys = new Set([
  "q",
  "product",
  "lifecycle",
  "health",
  "from",
  "to",
  "sort",
  "dir",
  "policy",
  "page",
]);
const inventoryReturnFragments = new Set(["inventory-ledger"]);
const INVENTORY_RETURN_ORIGIN = "https://inventory-return.invalid";

export function normalizeInventoryReturnPath(
  value: string,
  fallback: string,
): string {
  return inventoryReturnPaths.has(value) || productStockPathPattern.test(value)
    ? value
    : fallback;
}

export function isProductStockReturnPath(value: string): boolean {
  return productStockPathPattern.test(value.split(/[?#]/, 1)[0]);
}

export function normalizeInventoryReturnUrl(value: string, fallback: string): string {
  const safeFallback = normalizeInventoryReturnPath(
    fallback.split(/[?#]/, 1)[0],
    "/admin/inventory/available",
  );
  const trimmed = value.trim().slice(0, 1000);
  if (!trimmed || /[\r\n\\]/.test(trimmed)) return safeFallback;
  try {
    const incoming = new URL(trimmed, INVENTORY_RETURN_ORIGIN);
    if (incoming.origin !== INVENTORY_RETURN_ORIGIN) return safeFallback;
    const safePath = normalizeInventoryReturnPath(incoming.pathname, "");
    if (!safePath) return safeFallback;
    const safeQuery = new URLSearchParams();
    for (const [key, rawValue] of incoming.searchParams) {
      if (!inventoryReturnQueryKeys.has(key)) continue;
      const cleaned = rawValue.trim().slice(0, 200);
      if (cleaned) safeQuery.set(key, cleaned);
    }
    const query = safeQuery.toString();
    const fragment = incoming.hash.slice(1);
    const hash = inventoryReturnFragments.has(fragment) ? `#${fragment}` : "";
    return `${safePath}${query ? `?${query}` : ""}${hash}`;
  } catch {
    return safeFallback;
  }
}

export type AdminInventoryCounts = {
  available: number;
  sold: number;
  banned: number;
  archived: number;
  preorders: number;
};

export function summarizeProductStockGroups(
  groups: Array<{
    status: string;
    healthStatus: string;
    healthHttpStatus: number | null;
    _count: { _all: number };
  }>,
  bannedStockPolicy: BannedStockPolicy,
  requireHealthy = booleanEnv("STOCK_REQUIRE_HEALTHY", true),
  approvedAvailableBanned = 0,
) {
  const counts = { ready: 0, reserved: 0, sold: 0, banned: 0 };
  for (const group of groups) {
    const count = group._count._all;
    const sellable = isSellableStock({
      healthStatus: group.healthStatus,
      healthHttpStatus: group.healthHttpStatus,
      bannedSaleApprovedAt: null,
      bannedStockPolicy,
      requireHealthy,
    });
    if (group.status === "AVAILABLE" && sellable) counts.ready += count;
    if (group.status === "RESERVED") counts.reserved += count;
    if (group.status === "DELIVERED") counts.sold += count;
    if (group.status === "BANNED" || group.healthStatus === "BANNED") {
      counts.banned += count;
    }
  }
  if (bannedStockPolicy === "OWNER_APPROVAL") {
    counts.ready += Math.max(0, approvedAvailableBanned);
  }
  return counts;
}

const ADMIN_INVENTORY_COUNT_TTL_MS = 1_000;
let cachedInventoryCounts: {
  expiresAt: number;
  value: AdminInventoryCounts;
} | null = null;
let activeInventoryCountLoad: Promise<AdminInventoryCounts> | null = null;

export function bannedStockPolicyLabel(policy: string): string {
  if (policy === "ALLOW_HTTP_401") return "HTTP 401 otomatis dapat dijual";
  if (policy === "OWNER_APPROVAL") return "Dapat dijual dengan izin owner";
  if (policy === "RELOGIN_REQUIRED") return "Wajib relogin sampai sehat";
  return "Tidak dapat dijual saat banned";
}

export function canApproveBannedStockForSale(input: {
  status: string;
  healthStatus: string;
  archivedAt: Date | null;
  reservedOrderId: string | null;
  deliveredOrderId: string | null;
  hasOrderItem: boolean;
  hasDeliveryReceipt: boolean;
  productPolicy: string;
}): boolean {
  return (
    input.productPolicy === "OWNER_APPROVAL" &&
    input.status === "BANNED" &&
    input.healthStatus === "BANNED" &&
    !input.archivedAt &&
    !input.reservedOrderId &&
    !input.deliveredOrderId &&
    !input.hasOrderItem &&
    !input.hasDeliveryReceipt
  );
}

export type StockUploadNoticeParams = {
  notice?: string;
  imported?: string;
  processed?: string;
  skipped?: string;
  healthy?: string;
  banned?: string;
  ready?: string;
  errors?: string;
  allocated?: string;
};

export function stockUploadNotice(params: StockUploadNoticeParams): string | null {
  if (params.notice !== "stock-uploaded") return null;
  const imported = Number.parseInt(params.imported ?? "0", 10) || 0;
  const processed = Number.parseInt(params.processed ?? params.imported ?? "0", 10) || 0;
  const skipped = Number.parseInt(params.skipped ?? "0", 10) || 0;
  const healthy = Number.parseInt(params.healthy ?? "0", 10) || 0;
  const banned = Number.parseInt(params.banned ?? "0", 10) || 0;
  const ready = Number.parseInt(params.ready ?? params.healthy ?? "0", 10) || 0;
  const errors = Number.parseInt(params.errors ?? "0", 10) || 0;
  const allocated = Number.parseInt(params.allocated ?? "0", 10) || 0;
  if (imported === 0 && skipped > 0) {
    return `Tidak ada stok baru: ${processed} file/baris diproses dan ${skipped} sudah tersimpan, jadi semuanya dilewati dengan aman. Gudang tidak berisi duplikat.`;
  }
  const retryMessage = errors > 0
    ? ` ${errors} stok menunggu retry checker otomatis; stok tersebut tetap tersimpan dan bukan gagal upload.`
    : "";
  return `Upload berhasil: ${imported} stok baru berhasil disimpan dari ${processed} file/baris. Pemeriksaan awal: ${healthy} sehat, ${banned} terdeteksi HTTP 401/402, ${ready} siap dijual sesuai policy produk.${retryMessage} ${skipped} duplikat dilewati, ${allocated} dialokasikan ke preorder.`;
}

async function loadAdminInventoryCounts(): Promise<AdminInventoryCounts> {
  const [available, sold, banned, archived, preorders] = await Promise.all([
    prisma.digitalStockItem.count({
      where: {
        archivedAt: null,
        OR: [
          { status: "AVAILABLE", ...sellableStockWhere() },
          { status: "RESERVED" },
        ],
      },
    }),
    prisma.digitalStockItem.count({ where: { archivedAt: null, status: "DELIVERED" } }),
    prisma.digitalStockItem.count({
      where: {
        archivedAt: null,
        OR: [{ status: "BANNED" }, { healthStatus: "BANNED" }],
      },
    }),
    prisma.digitalStockItem.count({ where: { archivedAt: { not: null } } }),
    prisma.order.count({ where: { status: "PAID_WAITING_STOCK" } }),
  ]);

  return { available, sold, banned, archived, preorders };
}

/** Coalesce simultaneous admin renders; these values are navigation badges only. */
export function getAdminInventoryCounts(): Promise<AdminInventoryCounts> {
  const now = Date.now();
  if (cachedInventoryCounts && cachedInventoryCounts.expiresAt > now) {
    return Promise.resolve(cachedInventoryCounts.value);
  }
  if (activeInventoryCountLoad) return activeInventoryCountLoad;

  const run = loadAdminInventoryCounts();
  const tracked = run
    .then((value) => {
      cachedInventoryCounts = {
        value,
        expiresAt: Date.now() + ADMIN_INVENTORY_COUNT_TTL_MS,
      };
      return value;
    })
    .finally(() => {
      if (activeInventoryCountLoad === tracked) activeInventoryCountLoad = null;
    });
  activeInventoryCountLoad = tracked;
  return tracked;
}

export function maskInventoryFilename(filename: string): string {
  const atIndex = filename.indexOf("@");
  if (atIndex > 0) {
    const local = filename.slice(0, atIndex);
    return `${local.slice(0, Math.min(2, local.length))}***${filename.slice(atIndex)}`;
  }
  if (filename.length <= 32) return filename;
  return `${filename.slice(0, 14)}...${filename.slice(-14)}`;
}
