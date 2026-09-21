import {
  DigitalStockStatus,
  StockHealthStatus,
} from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { booleanEnv, integerEnv, optionalEnv } from "@/server/env";
import { decryptStockItem } from "@/server/stock/inventory";
import { detectStockContent } from "@/server/stock/credential";
import {
  parseCodexQuotaSnapshot,
  type StockQuotaSnapshot,
} from "@/server/stock/quota";
import { cleanError } from "@/server/utils/format";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";

export type HealthClassification = "HEALTHY" | "BANNED" | "ERROR";
const DEFAULT_CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const MAX_QUOTA_RESPONSE_BYTES = 256 * 1024;
const AUTO_CHECK_STATUSES = [
  DigitalStockStatus.AVAILABLE,
  DigitalStockStatus.BANNED,
  DigitalStockStatus.DELIVERED,
] as const;
const MAX_AUTO_CHECK_BATCH_SIZE = 9;

type AutoHealthCheckResult = {
  enabled: boolean;
  intervalSeconds: number;
  selected: number;
  checked: number;
  healthy: number;
  banned: number;
  errors: number;
};

export function isAutomaticHealthCheckStatus(
  status: DigitalStockStatus,
): boolean {
  return (
    status === DigitalStockStatus.AVAILABLE ||
    status === DigitalStockStatus.BANNED ||
    status === DigitalStockStatus.DELIVERED
  );
}

export function stockHealthUpdateGuard(item: {
  id: string;
  status: DigitalStockStatus;
  updatedAt: Date;
  reservedOrderId: string | null;
  deliveredOrderId: string | null;
}) {
  return {
    id: item.id,
    status: item.status,
    archivedAt: null,
    updatedAt: item.updatedAt,
    reservedOrderId: item.reservedOrderId,
    deliveredOrderId: item.deliveredOrderId,
  };
}

export function classifyHealthStatus(status: number): HealthClassification {
  if (status === 401 || status === 402) return "BANNED";
  if (status >= 200 && status < 300) return "HEALTHY";
  return "ERROR";
}

export function nextStockStatus(
  currentStatus: DigitalStockStatus,
  classification: HealthClassification,
  bannedSaleApproved = false,
  allowHttp401 = false,
): DigitalStockStatus {
  if (currentStatus === DigitalStockStatus.DELIVERED) {
    return DigitalStockStatus.DELIVERED;
  }
  if (currentStatus === DigitalStockStatus.DISABLED) {
    return DigitalStockStatus.DISABLED;
  }
  if (classification === "BANNED") {
    return bannedSaleApproved || allowHttp401
      ? DigitalStockStatus.AVAILABLE
      : DigitalStockStatus.BANNED;
  }
  if (
    classification === "HEALTHY" &&
    currentStatus === DigitalStockStatus.BANNED
  ) {
    return DigitalStockStatus.AVAILABLE;
  }
  return currentStatus;
}

async function requestHealthCheck(rawJson: string): Promise<{
  classification: HealthClassification;
  httpStatus?: number;
  error?: string;
  quotaSnapshot?: StockQuotaSnapshot;
}> {
  const configuredUrl = optionalEnv("STOCK_HEALTHCHECK_URL") ?? DEFAULT_CODEX_USAGE_URL;

  const url = new URL(configuredUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("STOCK_HEALTHCHECK_URL must use HTTPS");
  }

  const parsedStock = detectStockContent(rawJson);
  if (parsedStock.kind === "GENERIC") {
    return { classification: "HEALTHY" };
  }
  const { credential } = parsedStock;
  const accountId =
    credential.providerSpecificData?.workspaceId ??
    credential.providerSpecificData?.accountId ??
    credential.providerSpecificData?.chatgptAccountId;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    integerEnv("STOCK_HEALTHCHECK_TIMEOUT_MS", 15_000),
  );

  try {
    const response = await fetch(url, {
      method: optionalEnv("STOCK_HEALTHCHECK_METHOD") ?? "GET",
      headers: {
        Authorization: `Bearer ${credential.accessToken}`,
        ...(accountId
          ? {
              "ChatGPT-Account-ID": accountId,
            }
          : {}),
      },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    const classification = classifyHealthStatus(response.status);
    if (classification !== "HEALTHY") {
      return { classification, httpStatus: response.status };
    }

    const responseText = await response.text();
    if (Buffer.byteLength(responseText, "utf8") > MAX_QUOTA_RESPONSE_BYTES) {
      return {
        classification: "ERROR",
        httpStatus: response.status,
        error: "Quota response exceeds 256 KB",
      };
    }

    let responseJson: unknown;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      return {
        classification: "ERROR",
        httpStatus: response.status,
        error: "Quota response is not valid JSON",
      };
    }

    const quotaSnapshot = parseCodexQuotaSnapshot(responseJson);
    if (!quotaSnapshot) {
      return {
        classification: "ERROR",
        httpStatus: response.status,
        error: "Quota response has an unsupported structure",
      };
    }
    return {
      classification,
      httpStatus: response.status,
      quotaSnapshot,
    };
  } catch (error) {
    return { classification: "ERROR", error: cleanError(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkStockItem(stockItemId: string) {
  const item = await prisma.digitalStockItem.findUnique({
    where: { id: stockItemId },
  });
  if (!item) throw new Error("Stock item not found");
  if (item.archivedAt) throw new Error("Archived stock cannot be checked");
  if (item.status === DigitalStockStatus.RESERVED) {
    throw new Error("Reserved stock cannot be checked");
  }

  const result = await requestHealthCheck(decryptStockItem(item));
  await prisma.$transaction(async (tx) => {
    // Do not hold the inventory lock during the network request. Re-read the
    // current policy after the response so a concurrent admin toggle wins.
    await lockInventoryAllocation(tx, item.productId);
    const current = await tx.digitalStockItem.findUnique({
      where: { id: stockItemId },
      include: { product: { select: { bannedStockPolicy: true } } },
    });
    if (
      !current ||
      current.archivedAt ||
      current.status === DigitalStockStatus.RESERVED ||
      current.status === DigitalStockStatus.DISABLED
    ) {
      throw new Error("Stock item changed during health check");
    }

    const healthStatus = StockHealthStatus[result.classification];
    const nextStatus = nextStockStatus(
      current.status,
      result.classification,
      Boolean(
        current.bannedSaleApprovedAt &&
        current.product.bannedStockPolicy === "OWNER_APPROVAL",
      ),
      result.httpStatus === 401 &&
        current.product.bannedStockPolicy === "ALLOW_HTTP_401",
    );
    const updateData: Prisma.DigitalStockItemUpdateManyMutationInput = {
      status: nextStatus,
      healthStatus,
      healthHttpStatus: result.httpStatus,
      healthError: result.error,
      lastCheckedAt: new Date(),
    };
    if (result.classification === "HEALTHY") {
      updateData.quotaSnapshot = result.quotaSnapshot ?? Prisma.DbNull;
      updateData.bannedSaleApprovedAt = null;
      updateData.bannedSaleApprovedBy = null;
      updateData.bannedSaleApprovalNote = null;
    } else if (result.classification === "BANNED") {
      updateData.quotaSnapshot = Prisma.DbNull;
    }

    const updated = await tx.digitalStockItem.updateMany({
      where: stockHealthUpdateGuard(current),
      data: updateData,
    });
    if (updated.count !== 1) {
      throw new Error("Stock item changed during health check");
    }
  });

  return { ...result, productId: item.productId };
}

export async function checkStockItems(stockItemIds: string[]) {
  const results: HealthClassification[] = [];
  for (let index = 0; index < stockItemIds.length; index += 3) {
    const batch = stockItemIds.slice(index, index + 3);
    const checked = await Promise.all(
      batch.map(async (stockItemId) => {
        try {
          return (await checkStockItem(stockItemId)).classification;
        } catch {
          // A checkout/archive can race a batch selection; one item must not stop the run.
          return "ERROR" as const;
        }
      }),
    );
    results.push(...checked);
  }
  return {
    checked: results.length,
    healthy: results.filter((value) => value === "HEALTHY").length,
    banned: results.filter((value) => value === "BANNED").length,
    errors: results.filter((value) => value === "ERROR").length,
  };
}

export async function findAutoCheckCandidateIds({
  intervalSeconds,
  limit,
  now = new Date(),
  productId,
}: {
  intervalSeconds: number;
  limit: number;
  now?: Date;
  productId?: string;
}) {
  const take = Math.min(Math.max(limit, 1), MAX_AUTO_CHECK_BATCH_SIZE);
  const commonWhere: Prisma.DigitalStockItemWhereInput = {
    archivedAt: null,
    status: { in: [...AUTO_CHECK_STATUSES] },
    ...(productId ? { productId } : {}),
  };
  const unchecked = await prisma.digitalStockItem.findMany({
    where: { ...commonWhere, lastCheckedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take,
  });
  if (unchecked.length >= take) return unchecked.map((item) => item.id);

  const cutoff = new Date(now.getTime() - Math.max(intervalSeconds, 1) * 1_000);
  const stale = await prisma.digitalStockItem.findMany({
    where: {
      ...commonWhere,
      lastCheckedAt: { lte: cutoff },
      id: { notIn: unchecked.map((item) => item.id) },
    },
    select: { id: true },
    orderBy: { lastCheckedAt: "asc" },
    take: take - unchecked.length,
  });
  return [...unchecked, ...stale].map((item) => item.id);
}

export async function checkDueStockItems(): Promise<AutoHealthCheckResult> {
  const intervalSeconds = Math.min(
    integerEnv("STOCK_AUTO_CHECK_INTERVAL_SECONDS", 30),
    24 * 60 * 60,
  );
  if (!booleanEnv("STOCK_AUTO_CHECK_ENABLED", true)) {
    return {
      enabled: false,
      intervalSeconds,
      selected: 0,
      checked: 0,
      healthy: 0,
      banned: 0,
      errors: 0,
    };
  }

  const stockItemIds = await findAutoCheckCandidateIds({
    intervalSeconds,
    limit: integerEnv("STOCK_AUTO_CHECK_BATCH_SIZE", MAX_AUTO_CHECK_BATCH_SIZE),
  });
  const result = await checkStockItems(stockItemIds);
  return {
    enabled: true,
    intervalSeconds,
    selected: stockItemIds.length,
    ...result,
  };
}

export async function checkProductStock(productId: string, limit = 50) {
  const items = await prisma.digitalStockItem.findMany({
    where: {
      productId,
      archivedAt: null,
      status: { in: [...AUTO_CHECK_STATUSES] },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
  });

  return checkStockItems(items.map((item) => item.id));
}
