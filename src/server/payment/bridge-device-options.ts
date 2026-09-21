import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

const BRIDGE_HEARTBEAT_FRESH_MS = 10 * 60_000;
const SHOPEE_MIN_BRIDGE_VERSION = [1, 5, 7] as const;
const SHOPEE_MIN_BRIDGE_VERSION_CODE = 20;

type BridgeDeviceStatusRow = {
  deviceId: string;
  lastSeenAt: Date;
  listenerConnected: boolean | null;
  appVersion: string | null;
  appVersionCode: number | null;
};

type BridgeDeviceReadClient = Pick<Prisma.TransactionClient, "bridgeDeviceStatus">;

export type AdminBridgeDeviceOption = {
  deviceId: string;
  lastSeenAt: string;
  isFresh: boolean;
  listenerConnected: boolean | null;
  appVersion: string | null;
  appVersionCode: number | null;
  supportsShopeePartner: boolean | null;
};

function versionParts(value: string | null): number[] | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

export function bridgeSupportsShopeePartner(input: {
  appVersion: string | null;
  appVersionCode: number | null;
}): boolean | null {
  if (input.appVersionCode !== null) {
    return input.appVersionCode >= SHOPEE_MIN_BRIDGE_VERSION_CODE;
  }

  const parts = versionParts(input.appVersion);
  if (!parts) return null;
  for (let index = 0; index < SHOPEE_MIN_BRIDGE_VERSION.length; index += 1) {
    const current = parts[index] ?? 0;
    const minimum = SHOPEE_MIN_BRIDGE_VERSION[index];
    if (current !== minimum) return current > minimum;
  }
  return true;
}

export function toAdminBridgeDeviceOption(
  row: BridgeDeviceStatusRow,
  now = new Date(),
): AdminBridgeDeviceOption {
  return {
    deviceId: row.deviceId,
    lastSeenAt: row.lastSeenAt.toISOString(),
    isFresh: now.getTime() - row.lastSeenAt.getTime() <= BRIDGE_HEARTBEAT_FRESH_MS,
    listenerConnected: row.listenerConnected,
    appVersion: row.appVersion,
    appVersionCode: row.appVersionCode,
    supportsShopeePartner: bridgeSupportsShopeePartner(row),
  };
}

export async function listAdminBridgeDeviceOptions(
  now = new Date(),
): Promise<AdminBridgeDeviceOption[]> {
  const devices = await prisma.bridgeDeviceStatus.findMany({
    where: { source: "ANDROID" },
    orderBy: { lastSeenAt: "desc" },
    take: 20,
    select: {
      deviceId: true,
      lastSeenAt: true,
      listenerConnected: true,
      appVersion: true,
      appVersionCode: true,
    },
  });
  return devices.map((device) => toAdminBridgeDeviceOption(device, now));
}

export async function getAdminBridgeDeviceOption(
  deviceId: string,
  client: BridgeDeviceReadClient = prisma,
  now = new Date(),
): Promise<AdminBridgeDeviceOption | null> {
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId) return null;
  const device = await client.bridgeDeviceStatus.findFirst({
    where: {
      deviceId: normalizedDeviceId,
      source: "ANDROID",
    },
    select: {
      deviceId: true,
      lastSeenAt: true,
      listenerConnected: true,
      appVersion: true,
      appVersionCode: true,
    },
  });
  return device ? toAdminBridgeDeviceOption(device, now) : null;
}
