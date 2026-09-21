import { prisma } from "@/server/db/prisma";

export const ACCOUNT_REDEEM_VAULT_MISSING_KIND = "ACCOUNT_REDEEM_VAULT_MISSING";

export function accountRedeemVaultMissingDedupeKey(stockItemId: string) {
  return `account-redeem-vault-missing:${stockItemId}`;
}

export function accountRedeemVaultMissingNotice(missingCount: number) {
  return [
    `${missingCount} akun terverifikasi sebagai pembelianmu, tetapi data login Codex Free belum tersedia di vault.`,
    "Laporan sudah diteruskan ke admin. Kami tidak akan meminta access token atau password melalui chat.",
  ].join(" ");
}

export async function syncAccountRedeemVaultReports(input: {
  chatId: string;
  missing: Array<{ stockItemId: string; orderId: string }>;
  resolvedStockItemIds: string[];
}) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const item of input.missing) {
      await tx.telegramNotification.upsert({
        where: { dedupeKey: accountRedeemVaultMissingDedupeKey(item.stockItemId) },
        create: {
          dedupeKey: accountRedeemVaultMissingDedupeKey(item.stockItemId),
          chatId: input.chatId,
          orderId: item.orderId,
          stockItemId: item.stockItemId,
          kind: ACCOUNT_REDEEM_VAULT_MISSING_KIND,
          messageText: "Data login Codex Free untuk stok terjual ini belum tersedia di vault.",
          status: "MANUAL_REVIEW",
          lastError: "Delivered Codex Free stock has no AccountLoginCredential mapping",
        },
        update: {
          chatId: input.chatId,
          orderId: item.orderId,
          status: "MANUAL_REVIEW",
          sentAt: null,
          lastError: "Delivered Codex Free stock has no AccountLoginCredential mapping",
        },
      });
    }

    if (input.resolvedStockItemIds.length > 0) {
      await tx.telegramNotification.updateMany({
        where: {
          dedupeKey: {
            in: input.resolvedStockItemIds.map(accountRedeemVaultMissingDedupeKey),
          },
        },
        data: {
          status: "SENT",
          sentAt: now,
          lastError: null,
          messageText: "Data login Codex Free sudah tersedia dan laporan vault diselesaikan.",
        },
      });
    }
  });
}
