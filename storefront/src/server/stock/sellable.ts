import type { BannedStockPolicy } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { booleanEnv } from "@/server/env";

export function sellableStockWhere(
  requireHealthy = booleanEnv("STOCK_REQUIRE_HEALTHY", true),
): Prisma.DigitalStockItemWhereInput {
  if (!requireHealthy) {
    return {
      OR: [
        { healthStatus: { not: "BANNED" } },
        {
          healthStatus: "BANNED",
          bannedSaleApprovedAt: { not: null },
          product: { bannedStockPolicy: "OWNER_APPROVAL" },
        },
        {
          healthStatus: "BANNED",
          healthHttpStatus: 401,
          product: { bannedStockPolicy: "ALLOW_HTTP_401" },
        },
      ],
    };
  }

  return {
    OR: [
      { healthStatus: "HEALTHY" },
      {
        healthStatus: "BANNED",
        bannedSaleApprovedAt: { not: null },
        product: { bannedStockPolicy: "OWNER_APPROVAL" },
      },
      {
        healthStatus: "BANNED",
        healthHttpStatus: 401,
        product: { bannedStockPolicy: "ALLOW_HTTP_401" },
      },
    ],
  };
}

export function blockedBannedStockWhere(
  requireHealthy = booleanEnv("STOCK_REQUIRE_HEALTHY", true),
): Prisma.DigitalStockItemWhereInput {
  return {
    healthStatus: "BANNED",
    NOT: sellableStockWhere(requireHealthy),
  };
}

export function isSellableStock(input: {
  healthStatus: string;
  healthHttpStatus: number | null;
  bannedSaleApprovedAt: Date | null;
  bannedStockPolicy: BannedStockPolicy;
  requireHealthy?: boolean;
}): boolean {
  if (input.healthStatus === "HEALTHY") return true;
  if (input.healthStatus !== "BANNED") {
    return input.requireHealthy === false;
  }
  return Boolean(
    (input.bannedSaleApprovedAt &&
      input.bannedStockPolicy === "OWNER_APPROVAL") ||
      (input.healthHttpStatus === 401 &&
        input.bannedStockPolicy === "ALLOW_HTTP_401"),
  );
}
