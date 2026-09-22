import type { Prisma } from "@/generated/prisma/client";
import { booleanEnv } from "@/server/env";
import { shopeeSessionHealthReason } from "./shopee-session-health";

export async function qrisProviderUnavailableReason(client: Pick<Prisma.TransactionClient,"qrisMerchant"|"shopeePartnerSession">) {
  if (!booleanEnv("SHOPEE_WEB_SESSION_CHECKOUT_ENABLED",false)) return null;
  const merchant=await client.qrisMerchant.findFirst({where:{isActive:true,enabled:true,archivedAt:null},select:{providerKey:true,shopeeAccountFingerprint:true}});
  if (merchant?.providerKey !== "SHOPEE_PARTNER") return null;
  if (!merchant.shopeeAccountFingerprint) return "ACCOUNT_UNBOUND";
  const session=await client.shopeePartnerSession.findFirst({
    where:{merchantAccountFingerprint:merchant.shopeeAccountFingerprint,status:"ACTIVE",merchantId:{not:null},storeId:{not:null},lastValidatedAt:{not:null}},
    orderBy:[{lastValidatedAt:"desc"},{updatedAt:"desc"},{id:"desc"}],
    select:{status:true,lastSuccessfulPollAt:true,lastErrorCode:true},
  });
  return shopeeSessionHealthReason(session);
}
