import type { Prisma } from "@/generated/prisma/client";

export const deliveryFilterStatuses = [
  "READY",
  "SENT",
  "SENDING",
  "FAILED",
  "UNKNOWN",
  "REPORTED",
  "ATTENTION",
] as const;

export const notificationFilterStatuses = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "MANUAL_REVIEW",
] as const;

function normalizeStatus<const T extends readonly string[]>(
  value: string | undefined,
  allowed: T,
): T[number] | "" {
  return allowed.includes(value as T[number]) ? (value as T[number]) : "";
}

export function normalizeDeliveryFilterStatus(value: string | undefined) {
  return normalizeStatus(value, deliveryFilterStatuses);
}

export function normalizeNotificationFilterStatus(value: string | undefined) {
  return normalizeStatus(value, notificationFilterStatuses);
}

export function activeDeliveryMissingReportWhere(): Prisma.SentDeliveryWhereInput {
  return {
    order: {
      notifications: {
        some: { kind: "DELIVERY_MISSING_REPORT", status: "MANUAL_REVIEW" },
      },
    },
  };
}

export function deliveryStatusWhere(
  status: ReturnType<typeof normalizeDeliveryFilterStatus>,
): Prisma.SentDeliveryWhereInput {
  if (status === "REPORTED") return activeDeliveryMissingReportWhere();
  if (status === "ATTENTION") {
    return {
      OR: [
        { status: { in: ["FAILED", "UNKNOWN"] } },
        activeDeliveryMissingReportWhere(),
      ],
    };
  }
  return status ? { status } : {};
}

export function combineDeliveryWhere(
  ...filters: Prisma.SentDeliveryWhereInput[]
): Prisma.SentDeliveryWhereInput {
  return { AND: filters };
}
