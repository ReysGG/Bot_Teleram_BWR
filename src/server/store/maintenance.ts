import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

const STORE_RUNTIME_ID = "global";
export const DEFAULT_MAINTENANCE_MESSAGE =
  "Toko sedang maintenance. Checkout sementara ditutup, silakan coba lagi nanti.";

type MaintenanceClient = Pick<Prisma.TransactionClient, "storeRuntimeSetting">;

export async function getMaintenanceState(
  client: MaintenanceClient = prisma,
) {
  const state = await client.storeRuntimeSetting.findUnique({
    where: { id: STORE_RUNTIME_ID },
  });
  return {
    enabled: state?.maintenanceMode ?? false,
    message: state?.maintenanceMessage ?? DEFAULT_MAINTENANCE_MESSAGE,
    updatedAt: state?.updatedAt ?? null,
    updatedBy: state?.updatedBy ?? null,
  };
}

export async function setMaintenanceState(input: {
  enabled: boolean;
  message?: string | null;
  actor: string;
}) {
  const message = input.message?.trim().slice(0, 500) || null;
  return prisma.storeRuntimeSetting.upsert({
    where: { id: STORE_RUNTIME_ID },
    create: {
      id: STORE_RUNTIME_ID,
      maintenanceMode: input.enabled,
      maintenanceMessage: message,
      updatedBy: input.actor,
    },
    update: {
      maintenanceMode: input.enabled,
      maintenanceMessage: message,
      updatedBy: input.actor,
    },
  });
}

export async function assertStoreOrderingAvailable(client: MaintenanceClient) {
  const state = await getMaintenanceState(client);
  if (state.enabled) throw new Error(state.message);
}
