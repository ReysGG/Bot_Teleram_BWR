import { Prisma } from "@/generated/prisma/client";

export type WalletTopupFilter = "all" | "pending" | "paid" | "problem";

export function adminWalletTopupProviderLabel(input: {
  paymentMethod: string;
  qrisProviderKey?: string | null;
}) {
  if (input.paymentMethod === "JAGO_TRANSFER") return "Bank Jago";
  if (input.qrisProviderKey === "SHOPEE_PARTNER") return "QRIS ShopeePay";
  return "QRIS / DANA";
}

export function normalizeWalletTopupFilter(
  value: string | null | undefined,
): WalletTopupFilter {
  const normalized = value?.trim().toLowerCase();
  return normalized === "pending" || normalized === "paid" || normalized === "problem"
    ? normalized
    : "all";
}

export function walletTopupFilterWhere(
  filter: WalletTopupFilter,
  now = new Date(),
): Prisma.WalletTopupWhereInput {
  if (filter === "pending") {
    return { status: "PENDING", expiresAt: { gt: now } };
  }
  if (filter === "paid") return { status: "PAID" };
  if (filter === "problem") {
    return {
      OR: [
        { status: { in: ["EXPIRED", "FAILED"] } },
        { status: "PENDING", expiresAt: { lte: now } },
        { bridgeClaim: { is: { status: "FAILED" } } },
        {
          status: { not: "PAID" },
          bridgeEvents: { some: { status: "REJECTED" } },
        },
      ],
    };
  }
  return {};
}

export function walletTopupPresentation(input: {
  status: string;
  expiresAt: Date;
  verifiedBy?: string | null;
  bridgeClaimStatus?: string | null;
  bridgeClaimError?: string | null;
  eventStatus?: string | null;
  eventReason?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const overdue = input.status === "PENDING" && input.expiresAt <= now;
  const isProblem =
    input.status === "EXPIRED" ||
    input.status === "FAILED" ||
    overdue ||
    input.bridgeClaimStatus === "FAILED" ||
    (input.status !== "PAID" && input.eventStatus === "REJECTED");
  const label = input.status === "EXPIRED" || overdue
    ? "KEDALUWARSA"
    : input.status;
  const tone = input.status === "PAID"
    ? "good"
    : isProblem
      ? "bad"
      : "warn";
  const detail = input.eventReason
    ?? input.bridgeClaimError
    ?? (input.status === "PAID"
      ? `Terverifikasi oleh ${input.verifiedBy ?? "sistem"}`
      : overdue || input.status === "EXPIRED"
        ? "Tidak ada pembayaran cocok sebelum batas waktu."
        : input.eventStatus === "REJECTED"
          ? "Event pembayaran ditolak oleh pencocokan."
          : "Menunggu event pembayaran dari bridge.");

  return { label, tone, detail, isProblem };
}
