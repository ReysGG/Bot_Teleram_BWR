import { prisma } from "@/server/db/prisma";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { createZipArchive } from "@/server/files/zip";
import { accountEmailHash, decryptAccountLoginCredential, normalizeAccountEmail, serializeAccountLogin } from "@/server/redeem/account-login";
import { detectStockContent } from "@/server/stock/credential";
import { decryptStockFile } from "@/server/stock/inventory";
import { canTakeUnsoldStock } from "@/server/stock/admin-takeout-policy";

export class AdminTakeoutError extends Error {}

export async function downloadAdminStock(id: string, mode: "account" | "email" | "bundle", archive: boolean) {
  let output: Buffer | undefined;
  try {
    return await prisma.$transaction(async (tx) => {
      const identity = await tx.digitalStockItem.findUnique({ where: { id }, select: { productId: true } });
      if (!identity) throw new AdminTakeoutError("stock-missing");
      await lockInventoryAllocation(tx, identity.productId);
      const item = await tx.digitalStockItem.findUnique({ where: { id }, include: { orderItem: true, deliveryReceipt: true } });
      if (!item || !canTakeUnsoldStock(item)) throw new AdminTakeoutError("stock-ineligible");
      const buffers: Buffer[] = [];
      try {
        const file = decryptStockFile(item);
        buffers.push(file);
        let loginFile: Buffer | undefined;
        if (mode !== "account") {
          const parsed = detectStockContent(file.toString("utf8"));
          const email = parsed.kind === "K12" ? normalizeAccountEmail(parsed.credential.email ?? "") : null;
          if (!email) throw new AdminTakeoutError("email-missing");
          const emailHash = accountEmailHash(email);
          const credential = await tx.accountLoginCredential.findUnique({ where: { emailHash } });
          if (!credential) throw new AdminTakeoutError("email-unmapped");
          const login = decryptAccountLoginCredential(credential);
          if (accountEmailHash(login.email) !== emailHash) throw new AdminTakeoutError("email-mismatch");
          loginFile = Buffer.from(serializeAccountLogin(login) + "\n", "utf8");
          buffers.push(loginFile);
        }
        const filename = mode === "account" ? item.originalFilename : `stock-${id}.${mode === "bundle" ? "zip" : "txt"}`;
        output = mode === "bundle" ? createZipArchive([
          { filename: item.originalFilename, content: file },
          { filename: "email-login.txt", content: loginFile! },
        ]) : Buffer.from(mode === "email" ? loginFile! : file);
        if (archive && !item.archivedAt) {
          const changed = await tx.digitalStockItem.updateMany({
            where: { id, status: item.status, archivedAt: null, reservedOrderId: null, deliveredOrderId: null, orderItem: null, deliveryReceipt: null },
            data: { status: "DISABLED", archivedAt: new Date(), bannedSaleApprovedAt: null },
          });
          if (changed.count !== 1) throw new AdminTakeoutError("stock-changed");
        }
        return { file: output, filename };
      } finally { buffers.forEach((buffer) => buffer.fill(0)); }
    });
  } catch (error) {
    output?.fill(0);
    throw error;
  }
}
