import { describe, expect, it } from "vitest";
import { normalizeAdminSearch, orderSearchWhere } from "@/server/admin/order-search";
import { adminSearchHref } from "@/components/admin/admin-search-navigation";
import {
  combineDeliveryWhere,
  deliveryStatusWhere,
  normalizeDeliveryFilterStatus,
  normalizeNotificationFilterStatus,
} from "@/server/admin/status-filter";
import {
  inventorySearchWhere,
  productSearchWhere,
  walletSearchWhere,
  walletTopupSearchWhere,
} from "@/server/admin/catalog-search";
import { stockUploadNotice, summarizeProductStockGroups } from "@/server/admin/inventory";

describe("admin order search", () => {
  it("builds a clean search URL without requiring a native page reload", () => {
    expect(
      adminSearchHref("/admin/orders", "https://store.example/admin/orders?page=3", [
        ["q", "buyer"],
        ["status", ""],
      ]),
    ).toBe("/admin/orders?q=buyer");
  });

  it("normalizes whitespace and limits oversized queries", () => {
    expect(normalizeAdminSearch("  @buyer  ")).toBe("@buyer");
    expect(normalizeAdminSearch("x".repeat(200))).toHaveLength(120);
  });

  it("searches username without requiring the @ prefix", () => {
    const where = orderSearchWhere("@buyer");
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { buyerUsername: { contains: "buyer", mode: "insensitive" } },
      ]),
    );
  });

  it("does not add filters for an empty query", () => {
    expect(orderSearchWhere("   ")).toEqual({});
  });
});

describe("admin product stock summaries", () => {
  it("summarizes lifecycle counts in one grouped result while applying sellability policy", () => {
    expect(summarizeProductStockGroups([
      { status: "AVAILABLE", healthStatus: "HEALTHY", healthHttpStatus: 200, _count: { _all: 4 } },
      { status: "AVAILABLE", healthStatus: "BANNED", healthHttpStatus: 401, _count: { _all: 2 } },
      { status: "RESERVED", healthStatus: "HEALTHY", healthHttpStatus: 200, _count: { _all: 3 } },
      { status: "DELIVERED", healthStatus: "HEALTHY", healthHttpStatus: 200, _count: { _all: 5 } },
      { status: "BANNED", healthStatus: "BANNED", healthHttpStatus: 402, _count: { _all: 1 } },
    ], "ALLOW_HTTP_401")).toEqual({
      ready: 6,
      reserved: 3,
      sold: 5,
      banned: 3,
    });
  });

  it("keeps unknown stock sellable only when healthy stock is not required", () => {
    const groups = [
      { status: "AVAILABLE", healthStatus: "UNKNOWN", healthHttpStatus: null, _count: { _all: 2 } },
    ];
    expect(summarizeProductStockGroups(groups, "BLOCKED", true).ready).toBe(0);
    expect(summarizeProductStockGroups(groups, "BLOCKED", false).ready).toBe(2);
  });

  it("adds only the separately counted owner-approved banned stock", () => {
    const groups = [
      { status: "AVAILABLE", healthStatus: "BANNED", healthHttpStatus: 402, _count: { _all: 500 } },
    ];
    expect(summarizeProductStockGroups(
      groups,
      "OWNER_APPROVAL",
      true,
      7,
    )).toEqual({ ready: 7, reserved: 0, sold: 0, banned: 500 });
  });
});

describe("admin status filters", () => {
  it("accepts known delivery and notification statuses", () => {
    expect(normalizeDeliveryFilterStatus("FAILED")).toBe("FAILED");
    expect(normalizeDeliveryFilterStatus("REPORTED")).toBe("REPORTED");
    expect(normalizeDeliveryFilterStatus("ATTENTION")).toBe("ATTENTION");
    expect(normalizeNotificationFilterStatus("MANUAL_REVIEW")).toBe("MANUAL_REVIEW");
  });

  it("ignores unknown status query values", () => {
    expect(normalizeDeliveryFilterStatus("REFUNDED")).toBe("");
    expect(normalizeNotificationFilterStatus(undefined)).toBe("");
  });

  it("keeps search OR clauses when the attention status also uses OR", () => {
    const searchWhere = {
      OR: [
        { chatId: { contains: "buyer" } },
        { order: { invoiceNumber: { contains: "buyer" } } },
      ],
    };
    const where = combineDeliveryWhere(
      searchWhere,
      deliveryStatusWhere("ATTENTION"),
    );

    expect(where).toEqual({
      AND: [
        searchWhere,
        {
          OR: [
            { status: { in: ["FAILED", "UNKNOWN"] } },
            {
              order: {
                notifications: {
                  some: {
                    kind: "DELIVERY_MISSING_REPORT",
                    status: "MANUAL_REVIEW",
                  },
                },
              },
            },
          ],
        },
      ],
    });
  });
});

describe("admin catalog and wallet search", () => {
  it("searches products and optional attachments", () => {
    expect(productSearchWhere("guide").OR).toEqual(
      expect.arrayContaining([
        { name: { contains: "guide", mode: "insensitive" } },
        { attachmentOriginalFilename: { contains: "guide", mode: "insensitive" } },
      ]),
    );
  });

  it("searches inventory by file, product, fingerprint, and invoice", () => {
    expect(inventorySearchWhere("SYS-91").OR).toHaveLength(4);
  });

  it("normalizes Telegram usernames for wallet and top-up search", () => {
    expect(walletSearchWhere("@buyer").OR).toEqual(
      expect.arrayContaining([
        { buyerUsername: { contains: "buyer", mode: "insensitive" } },
      ]),
    );
    expect(walletTopupSearchWhere("@buyer").OR).toHaveLength(4);
  });

  it("maps provider names to wallet top-up payment methods", () => {
    expect(walletTopupSearchWhere("Bank Jago").OR).toContainEqual({
      paymentMethod: "JAGO_TRANSFER",
    });
    expect(walletTopupSearchWhere("QRIS").OR).toContainEqual({
      paymentMethod: "DANA_RELAY",
    });
  });
});

describe("stock upload feedback", () => {
  it("separates stored stock from the initial health-check result", () => {
    const notice = stockUploadNotice({
      notice: "stock-uploaded",
      processed: "100",
      imported: "100",
      skipped: "0",
      healthy: "92",
      banned: "0",
      ready: "92",
      errors: "8",
      allocated: "0",
    });

    expect(notice).toContain("100 stok baru berhasil disimpan");
    expect(notice).toContain("92 sehat");
    expect(notice).toContain("92 siap dijual sesuai policy produk");
    expect(notice).toContain("8 stok menunggu retry checker otomatis");
    expect(notice).toContain("bukan gagal upload");
  });

  it("explains when every processed item was already stored", () => {
    expect(
      stockUploadNotice({
        notice: "stock-uploaded",
        processed: "20",
        imported: "0",
        skipped: "20",
      }),
    ).toContain("20 sudah tersimpan");
  });
});
