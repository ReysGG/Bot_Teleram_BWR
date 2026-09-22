/** Explicit operator approval only; never used by provider/bridge callbacks. */
export function isAdminShopeePaymentOverride(input: {
  evidenceMode?: string;
  providerKey?: string;
  verifiedBy: string;
  allowOverride?: boolean;
  bridgeEventId?: string;
  shopeeTransactionId?: string;
}) {
  return input.evidenceMode === "WEB_SESSION" && input.providerKey === "SHOPEE_PARTNER" &&
    input.allowOverride === true && /^admin:\S+/.test(input.verifiedBy) &&
    !input.bridgeEventId && !input.shopeeTransactionId;
}
