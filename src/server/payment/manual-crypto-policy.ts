import { normalizeBinanceOrderIdValue } from "./binance-order-id";

export type ManualCryptoApproval = { reference: string; reason: string };
export class ManualCryptoApprovalError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "ManualCryptoApprovalError"; }
}
export function validateManualCryptoApproval(method: string, verifiedBy: string, input?: ManualCryptoApproval) {
  if (!input) return undefined;
  if (!verifiedBy.startsWith("admin:") || !verifiedBy.slice(6).trim() || !["BINANCE_INTERNAL", "USDT_BEP20"].includes(method)) {
    throw new ManualCryptoApprovalError("manual_approval_not_allowed");
  }
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 500) throw new ManualCryptoApprovalError("manual_approval_reason_required");
  let reference: string;
  if (method === "USDT_BEP20") {
    reference = input.reference.trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(reference)) throw new ManualCryptoApprovalError("manual_approval_reference_invalid");
  } else {
    try { reference = normalizeBinanceOrderIdValue(input.reference); }
    catch { throw new ManualCryptoApprovalError("manual_approval_reference_invalid"); }
  }
  return { reference, reason };
}
