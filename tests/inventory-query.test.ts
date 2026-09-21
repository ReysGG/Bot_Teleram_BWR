import { describe, expect, it } from "vitest";
import {
  inventoryFilterQuery,
  inventoryFilterWhere,
  inventoryOrderBy,
  parseInventoryFilters,
} from "@/server/admin/inventory-query";
import { normalizeInventoryReturnUrl } from "@/server/admin/inventory";

describe("admin inventory query", () => {
  it("normalizes allowlisted filters and preserves them for pagination", () => {
    const filters = parseInventoryFilters({
      q: " account ",
      product: "product-1",
      lifecycle: "delivered",
      health: "banned",
      from: "2026-08-01",
      to: "2026-08-17",
      sort: "filename",
      dir: "asc",
    });
    expect(inventoryFilterQuery(filters)).toEqual({
      q: "account",
      product: "product-1",
      lifecycle: "DELIVERED",
      health: "BANNED",
      from: "2026-08-01",
      to: "2026-08-17",
      sort: "filename",
      dir: "asc",
    });
  });

  it("uses Jakarta day boundaries and an exclusive next-day upper bound", () => {
    const where = inventoryFilterWhere(
      parseInventoryFilters({ from: "2026-08-01", to: "2026-08-17" }),
      "lastCheckedAt",
    );
    const serialized = JSON.stringify(where);
    expect(serialized).toContain("2026-07-31T17:00:00.000Z");
    expect(serialized).toContain("2026-08-17T17:00:00.000Z");
  });

  it("uses server-side sorting with a stable id tie-breaker", () => {
    expect(
      inventoryOrderBy(parseInventoryFilters({ sort: "date", dir: "desc" }), "deliveredAt"),
    ).toEqual([
      { deliveredAt: { sort: "desc", nulls: "last" } },
      { id: "asc" },
    ]);
  });

  it("preserves allowlisted inventory filters without allowing an open redirect", () => {
    expect(
      normalizeInventoryReturnUrl(
        "/admin/inventory/banned?q=mail%40example.com&sort=filename&page=4&evil=1#inventory-ledger",
        "/admin/inventory/banned",
      ),
    ).toBe("/admin/inventory/banned?q=mail%40example.com&sort=filename&page=4#inventory-ledger");
    expect(
      normalizeInventoryReturnUrl("https://evil.example/path", "/admin/inventory/available"),
    ).toBe("/admin/inventory/available");
  });
});
