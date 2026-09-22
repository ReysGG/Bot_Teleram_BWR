export const payoutActions = {
  approve: { from: ["REQUESTED"], to: "APPROVED", label: "Setujui permintaan", reason: false, reference: false },
  reject: { from: ["REQUESTED", "APPROVED"], to: "REJECTED", label: "Tolak permintaan", reason: true, reference: false },
  start: { from: ["APPROVED"], to: "PROCESSING", label: "Mulai transfer manual", reason: false, reference: false },
  review: { from: ["PROCESSING"], to: "MANUAL_REVIEW", label: "Periksa transfer manual", reason: true, reference: false },
  paid: { from: ["PROCESSING", "MANUAL_REVIEW"], to: "PAID", label: "Catat transfer berhasil", reason: false, reference: true },
  fail: { from: ["PROCESSING", "MANUAL_REVIEW"], to: "FAILED_FINAL", label: "Catat transfer pasti gagal", reason: true, reference: false },
};
export type PayoutAction = keyof typeof payoutActions;
export function isPayoutAction(value: string): value is PayoutAction { return Object.hasOwn(payoutActions, value); }
export function allowedPayoutActions(status: string) { return (Object.keys(payoutActions) as PayoutAction[]).filter(action => payoutActions[action].from.includes(status)); }
