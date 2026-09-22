import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { booleanEnv, optionalEnv } from "@/server/env";

const STORE_RUNTIME_ID = "global";

export type JagoTransferSettingClient = Pick<
  Prisma.TransactionClient,
  "storeRuntimeSetting"
>;

export function normalizeJagoAccountNumber(
  value: string | null | undefined,
): string {
  const normalized = value?.replace(/\s+/g, "").trim() ?? "";
  if (!/^\d{8,20}$/.test(normalized)) {
    throw new Error("Nomor rekening Jago harus berisi 8-20 digit.");
  }
  return normalized;
}

export async function getJagoTransferSetting(
  client: JagoTransferSettingClient = prisma,
) {
  const setting = await client.storeRuntimeSetting.findUnique({
    where: { id: STORE_RUNTIME_ID },
    select: {
      jagoTransferEnabled: true,
      jagoTransferAccountNumber: true,
      jagoTransferUpdatedAt: true,
      jagoTransferUpdatedBy: true,
    },
  });
  const envAccountNumber = optionalEnv("JAGO_TRANSFER_ACCOUNT_NUMBER");
  const accountNumber = setting?.jagoTransferAccountNumber
    ? normalizeJagoAccountNumber(setting.jagoTransferAccountNumber)
    : envAccountNumber
      ? normalizeJagoAccountNumber(envAccountNumber)
      : null;
  const enabled = setting
    ? setting.jagoTransferEnabled
    : booleanEnv("JAGO_TRANSFER_ENABLED", false);
  return {
    enabled: enabled && Boolean(accountNumber),
    accountNumber,
    accountNumberSource: setting?.jagoTransferAccountNumber
      ? ("DATABASE" as const)
      : envAccountNumber
        ? ("ENV" as const)
        : ("NONE" as const),
    updatedAt: setting?.jagoTransferUpdatedAt ?? null,
    updatedBy: setting?.jagoTransferUpdatedBy ?? null,
  };
}

export async function setJagoTransferSetting(
  input: { enabled: boolean; accountNumber?: string | null; actor: string },
  client: JagoTransferSettingClient = prisma,
) {
  const accountNumber = input.accountNumber?.trim()
    ? normalizeJagoAccountNumber(input.accountNumber)
    : null;
  if (
    input.enabled &&
    !accountNumber &&
    !optionalEnv("JAGO_TRANSFER_ACCOUNT_NUMBER")
  ) {
    throw new Error(
      "Nomor rekening Jago wajib diisi sebelum pembayaran diaktifkan.",
    );
  }
  const updatedAt = new Date();
  return client.storeRuntimeSetting.upsert({
    where: { id: STORE_RUNTIME_ID },
    create: {
      id: STORE_RUNTIME_ID,
      jagoTransferEnabled: input.enabled,
      jagoTransferAccountNumber: accountNumber,
      jagoTransferUpdatedAt: updatedAt,
      jagoTransferUpdatedBy: input.actor,
    },
    update: {
      jagoTransferEnabled: input.enabled,
      jagoTransferAccountNumber: accountNumber,
      jagoTransferUpdatedAt: updatedAt,
      jagoTransferUpdatedBy: input.actor,
    },
  });
}
