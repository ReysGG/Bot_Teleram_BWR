import { describe, expect, it } from "vitest";
import {
  selectAvailableUniqueCode,
  uniqueCodeCandidates,
} from "@/server/checkout/amount";
import { paymentAmountReservationCutoff } from "@/server/payment/window";
import {
  DigitalStockStatus,
  StockHealthStatus,
} from "@/generated/prisma/enums";
import {
  archiveTargetStatus,
  canPermanentlyDeleteStock,
  restoreTargetStatus,
} from "@/server/stock/admin-actions";
import {
  canApproveBannedStockForSale,
  normalizeInventoryReturnPath,
} from "@/server/admin/inventory";
import {
  adminPagination,
  parseAdminPage,
} from "@/server/admin/pagination";
import {
  classifyHealthStatus,
  isAutomaticHealthCheckStatus,
  nextStockStatus,
  stockHealthUpdateGuard,
} from "@/server/stock/health-check";
import {
  detectStockContent,
  parseCredentialJson,
  parseStockJson,
} from "@/server/stock/credential";
import { canEditStockItem, expandStockFiles } from "@/server/stock/inventory";
import {
  blockedBannedStockWhere,
  isSellableStock,
  sellableStockWhere,
} from "@/server/stock/sellable";
import {
  buildCombinedTextInventory,
  combinedTextFilename,
  plainTextStockContent,
} from "@/server/stock/text-export";
import {
  parseCodexQuotaSnapshot,
  readStockQuotaSnapshot,
} from "@/server/stock/quota";
import { cleanError, safeFilename } from "@/server/utils/format";

describe("TXT stock expansion", () => {
  it("combines multiple purchased TXT units into one delivery file", () => {
    expect(plainTextStockContent("account.txt", Buffer.from("user1|pass1"))).toBe("user1|pass1");
    expect(plainTextStockContent("account.pdf", Buffer.from("user1|pass1"))).toBeNull();
    expect(buildCombinedTextInventory(["user1|pass1", "user2|pass2"]).toString("utf8")).toBe(
      "user1|pass1\nuser2|pass2\n",
    );
    expect(combinedTextFilename("INV/001", 2)).toBe("INV-001-2-items.txt");
  });

  it("turns each non-empty TXT line into one stock item", () => {
    const expanded = expandStockFiles([
      {
        filename: "codes.txt",
        content: Buffer.from("SYS-91BFCA1FE24C\n\nSYS-91BFwuwuhusC\n", "utf8"),
      },
    ]);
    expect(expanded.map((item) => item.content.toString("utf8"))).toEqual([
      "SYS-91BFCA1FE24C",
      "SYS-91BFwuwuhusC",
    ]);
  });

  it("keeps JSON stored in a TXT file as one credential", () => {
    const content = Buffer.from('{"access_token":"token-value"}', "utf8");
    expect(expandStockFiles([{ filename: "account.txt", content }])).toEqual([
      { filename: "account.txt", content },
    ]);
  });

  it("turns a combined JSON array into one stock item per account", () => {
    const accounts = [
      { email: "first@example.com", accessToken: "a".repeat(30) },
      { email: "second@example.com", accessToken: "b".repeat(30) },
    ];
    const expanded = expandStockFiles([{
      filename: "combined.json",
      content: Buffer.from(JSON.stringify(accounts), "utf8"),
    }]);

    expect(expanded.map((item) => item.filename)).toEqual([
      "first@example.com.json",
      "second@example.com.json",
    ]);
    expect(expanded.map((item) => JSON.parse(item.content.toString("utf8")))).toEqual(accounts);
  });
});

describe("stock health classification", () => {
  it("treats HTTP 401 and 402 as unusable stock", () => {
    expect(classifyHealthStatus(200)).toBe("HEALTHY");
    expect(classifyHealthStatus(204)).toBe("HEALTHY");
    expect(classifyHealthStatus(402)).toBe("BANNED");
    expect(classifyHealthStatus(401)).toBe("BANNED");
    expect(classifyHealthStatus(429)).toBe("ERROR");
  });

  it("keeps sold stock delivered when a later check returns 402", () => {
    expect(nextStockStatus(DigitalStockStatus.DELIVERED, "BANNED")).toBe(
      DigitalStockStatus.DELIVERED,
    );
  });

  it("moves active banned stock back to available after a healthy check", () => {
    expect(nextStockStatus(DigitalStockStatus.AVAILABLE, "BANNED")).toBe(
      DigitalStockStatus.BANNED,
    );
    expect(nextStockStatus(DigitalStockStatus.BANNED, "HEALTHY")).toBe(
      DigitalStockStatus.AVAILABLE,
    );
    expect(nextStockStatus(DigitalStockStatus.BANNED, "BANNED", false, true)).toBe(
      DigitalStockStatus.AVAILABLE,
    );
  });

  it("keeps an owner-approved banned stock sellable without marking it healthy", () => {
    expect(nextStockStatus(DigitalStockStatus.BANNED, "BANNED", true)).toBe(
      DigitalStockStatus.AVAILABLE,
    );
    expect(
      isSellableStock({
        healthStatus: "BANNED",
        healthHttpStatus: 402,
        bannedSaleApprovedAt: new Date(),
        bannedStockPolicy: "OWNER_APPROVAL",
      }),
    ).toBe(true);
    expect(
      isSellableStock({
        healthStatus: "BANNED",
        healthHttpStatus: 401,
        bannedSaleApprovedAt: new Date(),
        bannedStockPolicy: "RELOGIN_REQUIRED",
      }),
    ).toBe(false);
    expect(
      isSellableStock({
        healthStatus: "BANNED",
        healthHttpStatus: 401,
        bannedSaleApprovedAt: null,
        bannedStockPolicy: "ALLOW_HTTP_401",
      }),
    ).toBe(true);
    expect(
      isSellableStock({
        healthStatus: "BANNED",
        healthHttpStatus: 402,
        bannedSaleApprovedAt: null,
        bannedStockPolicy: "ALLOW_HTTP_401",
      }),
    ).toBe(false);
    expect(sellableStockWhere()).toMatchObject({
      OR: expect.arrayContaining([
        expect.objectContaining({
          healthStatus: "BANNED",
          healthHttpStatus: 401,
          product: { bannedStockPolicy: "ALLOW_HTTP_401" },
        }),
      ]),
    });
    expect(blockedBannedStockWhere()).toMatchObject({
      healthStatus: "BANNED",
      NOT: expect.objectContaining({ OR: expect.any(Array) }),
    });
  });

  it("auto-checks sellable, banned, and sold accounts but skips locked stock", () => {
    expect(isAutomaticHealthCheckStatus(DigitalStockStatus.AVAILABLE)).toBe(true);
    expect(isAutomaticHealthCheckStatus(DigitalStockStatus.BANNED)).toBe(true);
    expect(isAutomaticHealthCheckStatus(DigitalStockStatus.DELIVERED)).toBe(true);
    expect(isAutomaticHealthCheckStatus(DigitalStockStatus.RESERVED)).toBe(false);
    expect(isAutomaticHealthCheckStatus(DigitalStockStatus.DISABLED)).toBe(false);
  });

  it("guards health writes with the complete stock lifecycle snapshot", () => {
    const updatedAt = new Date("2026-08-04T10:00:00.000Z");
    expect(
      stockHealthUpdateGuard({
        id: "stock-1",
        status: DigitalStockStatus.AVAILABLE,
        updatedAt,
        reservedOrderId: null,
        deliveredOrderId: null,
      }),
    ).toEqual({
      id: "stock-1",
      status: DigitalStockStatus.AVAILABLE,
      archivedAt: null,
      updatedAt,
      reservedOrderId: null,
      deliveredOrderId: null,
    });
  });
});

describe("admin stock retention", () => {
  it("paginates inventory in bounded 20-row pages", () => {
    expect(parseAdminPage("3")).toBe(3);
    expect(parseAdminPage("invalid")).toBe(1);
    expect(adminPagination(45, 3)).toMatchObject({
      page: 3,
      pageSize: 20,
      totalPages: 3,
      skip: 40,
      take: 20,
    });
    expect(adminPagination(45, 99).page).toBe(3);
  });

  it("archives unsold stock as disabled but preserves delivered lifecycle", () => {
    expect(archiveTargetStatus(DigitalStockStatus.AVAILABLE)).toBe(
      DigitalStockStatus.DISABLED,
    );
    expect(archiveTargetStatus(DigitalStockStatus.DELIVERED)).toBe(
      DigitalStockStatus.DELIVERED,
    );
    expect(() => archiveTargetStatus(DigitalStockStatus.RESERVED)).toThrow();
  });

  it("accepts product warehouse return paths without allowing open redirects", () => {
    expect(
      normalizeInventoryReturnPath(
        "/admin/products/cm123_stock/stock",
        "/admin/inventory/available",
      ),
    ).toBe("/admin/products/cm123_stock/stock");
    expect(
      normalizeInventoryReturnPath(
        "/admin/inventory/banned-recovery",
        "/admin/inventory/available",
      ),
    ).toBe("/admin/inventory/banned-recovery");
    expect(
      normalizeInventoryReturnPath(
        "https://evil.example/steal",
        "/admin/inventory/available",
      ),
    ).toBe("/admin/inventory/available");
  });

  it("allows owner approval only for unallocated banned stock under the correct policy", () => {
    const candidate = {
      status: "BANNED",
      healthStatus: "BANNED",
      archivedAt: null,
      reservedOrderId: null,
      deliveredOrderId: null,
      hasOrderItem: false,
      hasDeliveryReceipt: false,
      productPolicy: "OWNER_APPROVAL",
    };
    expect(canApproveBannedStockForSale(candidate)).toBe(true);
    expect(canApproveBannedStockForSale({ ...candidate, productPolicy: "RELOGIN_REQUIRED" })).toBe(false);
    expect(canApproveBannedStockForSale({ ...candidate, deliveredOrderId: "order-1" })).toBe(false);
  });

  it("restores archived stock according to its health status", () => {
    expect(
      restoreTargetStatus(DigitalStockStatus.DISABLED, StockHealthStatus.HEALTHY),
    ).toBe(DigitalStockStatus.AVAILABLE);
    expect(
      restoreTargetStatus(DigitalStockStatus.DISABLED, StockHealthStatus.BANNED),
    ).toBe(DigitalStockStatus.BANNED);
    expect(
      restoreTargetStatus(DigitalStockStatus.DISABLED, StockHealthStatus.BANNED, {
        healthHttpStatus: 401,
        bannedSaleApprovedAt: null,
        bannedStockPolicy: "ALLOW_HTTP_401",
      }),
    ).toBe(DigitalStockStatus.AVAILABLE);
    expect(
      restoreTargetStatus(DigitalStockStatus.DISABLED, StockHealthStatus.BANNED, {
        healthHttpStatus: 402,
        bannedSaleApprovedAt: null,
        bannedStockPolicy: "ALLOW_HTTP_401",
      }),
    ).toBe(DigitalStockStatus.BANNED);
    expect(
      restoreTargetStatus(DigitalStockStatus.DELIVERED, StockHealthStatus.BANNED),
    ).toBe(DigitalStockStatus.DELIVERED);
  });

  it("allows permanent deletion only for unreferenced unsold stock", () => {
    const base = {
      reservedOrderId: null,
      deliveredOrderId: null,
      hasOrderItem: false,
      hasDeliveryReceipt: false,
    };
    expect(
      canPermanentlyDeleteStock({ ...base, status: DigitalStockStatus.AVAILABLE }),
    ).toBe(true);
    expect(
      canPermanentlyDeleteStock({ ...base, status: DigitalStockStatus.DELIVERED }),
    ).toBe(false);
    expect(
      canPermanentlyDeleteStock({
        ...base,
        status: DigitalStockStatus.BANNED,
        hasOrderItem: true,
      }),
    ).toBe(false);
  });

  it("allows editing only unreferenced stock outside checkout and delivery", () => {
    const editable = {
      reservedOrderId: null,
      deliveredOrderId: null,
      hasOrderItem: false,
      hasDeliveryReceipt: false,
    };
    expect(
      canEditStockItem({ ...editable, status: DigitalStockStatus.AVAILABLE }),
    ).toBe(true);
    expect(
      canEditStockItem({ ...editable, status: DigitalStockStatus.BANNED }),
    ).toBe(true);
    expect(
      canEditStockItem({ ...editable, status: DigitalStockStatus.DISABLED }),
    ).toBe(true);
    expect(
      canEditStockItem({ ...editable, status: DigitalStockStatus.RESERVED }),
    ).toBe(false);
    expect(
      canEditStockItem({
        ...editable,
        status: DigitalStockStatus.AVAILABLE,
        hasOrderItem: true,
      }),
    ).toBe(false);
  });
});

describe("credential ingestion", () => {
  function accessToken(subject: string, suffix: string): string {
    const payload = Buffer.from(JSON.stringify({ sub: subject })).toString(
      "base64url",
    );
    return `header.${payload}.signature-${suffix}`;
  }

  it("creates a stable fingerprint without returning token data", () => {
    const raw = JSON.stringify({
      accessToken: "x".repeat(30),
      provider: "chatgpt",
      providerSpecificData: { chatgptAccountId: "account-123" },
    });
    const first = parseCredentialJson(raw);
    const second = parseCredentialJson(raw);

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).not.toContain("account-123");
  });

  it("keeps different users distinct when 9router reuses one ChatGPT account id", () => {
    const shared = { chatgptAccountId: "shared-team-workspace" };
    const first = parseCredentialJson(
      JSON.stringify({
        accessToken: accessToken("user-a", "first"),
        email: "first@example.com",
        provider: "codex",
        providerSpecificData: shared,
      }),
    );
    const second = parseCredentialJson(
      JSON.stringify({
        accessToken: accessToken("user-b", "second"),
        email: "second@example.com",
        provider: "codex",
        providerSpecificData: shared,
      }),
    );

    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it("deduplicates a token refresh for the same JWT subject", () => {
    const first = parseCredentialJson(
      JSON.stringify({
        accessToken: accessToken("stable-user", "old-token"),
        provider: "codex",
      }),
    );
    const second = parseCredentialJson(
      JSON.stringify({
        accessToken: accessToken("stable-user", "new-token"),
        provider: "codex",
      }),
    );

    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it("rejects JSON without an access token", () => {
    expect(() => parseCredentialJson('{"provider":"chatgpt"}')).toThrow();
  });

  it("accepts generic JSON with a canonical duplicate fingerprint", () => {
    const first = parseStockJson('{"product":"license","value":{"b":2,"a":1}}');
    const second = parseStockJson(
      '{ "value": { "a": 1, "b": 2 }, "product": "license" }',
    );

    expect(first.kind).toBe("GENERIC");
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it("automatically detects K12 credential JSON", () => {
    const detected = parseStockJson(
      JSON.stringify({
        accessToken: "x".repeat(30),
        provider: "chatgpt",
        providerSpecificData: { accountId: "account-k12" },
      }),
    );

    expect(detected.kind).toBe("K12");
  });

  it("accepts non-JSON text as generic stock", () => {
    const detected = detectStockContent("username: buyer\npassword: secret");

    expect(detected.kind).toBe("GENERIC");
    expect(detected.fingerprint).toHaveLength(64);
  });

  it("sanitizes delivery filenames while preserving the original extension", () => {
    expect(safeFilename("../buyer name/account.json")).toBe("account.json");
    expect(safeFilename("buyer account.txt")).toBe("buyer_account.txt");
    expect(safeFilename("credential")).toBe("credential");
  });

  it("redacts credential material before an error reaches logs or audit fields", () => {
    const cleaned = cleanError(
      new Error(
        'request failed accessToken="secret-token-value" password=super-secret Bearer bearer-secret sk-abcdefghijklmnopqrstuvwxyz',
      ),
    );

    expect(cleaned).not.toContain("secret-token-value");
    expect(cleaned).not.toContain("super-secret");
    expect(cleaned).not.toContain("bearer-secret");
    expect(cleaned).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(cleaned).toContain("[REDACTED]");
  });
});

describe("codex quota snapshot", () => {
  it("normalizes session and weekly quota without retaining credential data", () => {
    const checkedAt = new Date("2026-07-29T12:00:00.000Z");
    const snapshot = parseCodexQuotaSnapshot(
      {
        plan_type: "team",
        rate_limit: {
          limit_reached: false,
          primary_window: {
            used_percent: 25,
            reset_at: "2026-07-29T14:00:00.000Z",
          },
          secondary_window: {
            used_percent: 60,
            reset_at: "2026-08-02T00:00:00.000Z",
          },
        },
      },
      checkedAt,
    );

    expect(snapshot).toMatchObject({
      plan: "team",
      checkedAt: checkedAt.toISOString(),
      quotas: [
        { key: "session", remaining: 75 },
        { key: "weekly", remaining: 40 },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain("accessToken");
    expect(readStockQuotaSnapshot(snapshot)?.quotas).toHaveLength(2);
  });

  it("rejects unsupported stored quota data", () => {
    expect(parseCodexQuotaSnapshot(null)).toBeNull();
    expect(readStockQuotaSnapshot({ version: 2, quotas: [] })).toBeNull();
  });
});

describe("unique payment fee allocation", () => {
  it("keeps expired payment amounts reserved for the full bridge skew", () => {
    const now = new Date("2026-08-04T10:05:00.000Z");
    expect(paymentAmountReservationCutoff(now).toISOString()).toBe(
      "2026-08-04T10:00:00.000Z",
    );
  });

  it("covers every unique code from 1 through 99 exactly once", () => {
    const candidates = uniqueCodeCandidates(91);
    expect(candidates[0]).toBe(91);
    expect(candidates).toHaveLength(99);
    expect(new Set(candidates).size).toBe(99);
    expect(Math.min(...candidates)).toBe(1);
    expect(Math.max(...candidates)).toBe(99);
    expect(8_000 + candidates[0]).toBe(8_091);
  });

  it("reuses a code across different base prices but skips a colliding final amount", () => {
    expect(
      selectAvailableUniqueCode({
        candidates: [91, 92, 93],
        baseAmount: 8_000,
        activeAmounts: new Set([8_092]),
      }),
    ).toBe(91);
  });

  it("keeps final billed amounts globally unique", () => {
    expect(
      selectAvailableUniqueCode({
        candidates: [91, 92, 93],
        baseAmount: 8_000,
        activeAmounts: new Set([8_091, 8_092]),
      }),
    ).toBe(93);
  });
});
