import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

const STORE_RUNTIME_ID = "global";
export const MAX_ACCOUNT_REDEEM_DESCRIPTION_LENGTH = 3_000;
export const DEFAULT_ACCOUNT_REDEEM_DESCRIPTION = [
  "Jika akun yang kamu cari tidak muncul di hasil, mohon maaf, berarti data login tersebut telah hilang.",
  "Kami sudah berusaha semaksimal mungkin untuk mencari dan mencocokkan email dari file yang kamu kirim.",
  "Data yang berhasil dikirim oleh bot adalah seluruh data yang masih tersedia di sistem kami.",
].join("\n");

export type RedeemSettingsClient = Pick<
  Prisma.TransactionClient,
  "storeRuntimeSetting"
>;

export function normalizeAccountRedeemDescription(
  value: string | null | undefined,
) {
  const normalized = value?.replace(/\r\n?/g, "\n").trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > MAX_ACCOUNT_REDEEM_DESCRIPTION_LENGTH) {
    throw new RangeError(
      `Deskripsi maksimal ${MAX_ACCOUNT_REDEEM_DESCRIPTION_LENGTH} karakter.`,
    );
  }
  return normalized;
}

export async function getAccountRedeemSettings(
  client: RedeemSettingsClient = prisma,
) {
  const setting = await client.storeRuntimeSetting.findUnique({
    where: { id: STORE_RUNTIME_ID },
    select: {
      accountRedeemDescription: true,
      accountRedeemDescriptionUpdatedAt: true,
      accountRedeemDescriptionUpdatedBy: true,
    },
  });
  const description = normalizeAccountRedeemDescription(
    setting?.accountRedeemDescription,
  );
  return {
    description: description ?? DEFAULT_ACCOUNT_REDEEM_DESCRIPTION,
    isDefault: description === null,
    updatedAt: setting?.accountRedeemDescriptionUpdatedAt ?? null,
    updatedBy: setting?.accountRedeemDescriptionUpdatedBy ?? null,
  };
}

export async function setAccountRedeemDescription(
  input: { description: string | null; actor: string },
  client: RedeemSettingsClient = prisma,
) {
  const description = normalizeAccountRedeemDescription(input.description);
  const updatedAt = new Date();
  return client.storeRuntimeSetting.upsert({
    where: { id: STORE_RUNTIME_ID },
    create: {
      id: STORE_RUNTIME_ID,
      accountRedeemDescription: description,
      accountRedeemDescriptionUpdatedBy: input.actor,
      accountRedeemDescriptionUpdatedAt: updatedAt,
    },
    update: {
      accountRedeemDescription: description,
      accountRedeemDescriptionUpdatedBy: input.actor,
      accountRedeemDescriptionUpdatedAt: updatedAt,
    },
  });
}
