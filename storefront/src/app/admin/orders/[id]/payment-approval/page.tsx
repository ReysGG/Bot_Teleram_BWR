import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { adminOrderPaymentRecoveryAction } from "@/server/payment/admin-recovery-policy";
import { formatUsdtMicros } from "@/server/payment/usdt-amount";

const errors: Record<string, string> = {
  manual_approval_reference_required: "Isi referensi transaksi dan catatan pemeriksaan.",
  manual_approval_reference_invalid: "Format Order ID Binance atau hash transaksi USDT tidak valid.",
  manual_approval_reason_required: "Tulis catatan pemeriksaan antara 10 dan 500 karakter.",
  manual_approval_reference_used: "Referensi transaksi sudah terikat ke invoice lain. Pembayaran tidak diubah.",
  manual_approval_reference_mismatch: "Referensi tidak cocok dengan yang sudah tercatat pada invoice ini.",
  payment_expired: "Invoice sudah kedaluwarsa. Approval manual tidak membuka kembali stok yang dilepas.",
  payment_unavailable: "Status invoice sudah berubah dan tidak dapat dikonfirmasi dari halaman ini.",
  provider_recheck_required: "Invoice ini tidak lagi aktif. Buka detail untuk pemeriksaan lanjutan.",
};
export const dynamic = "force-dynamic";
export default async function ManualPaymentApprovalPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const admin = await requireAdminPage();
  const { id } = await params;
  const [order, counts, query] = await Promise.all([
    prisma.order.findUnique({ where: { id }, include: { payment: true, binanceInternalPaymentAttempt: true, usdtBep20Attempt: true } }),
    getAdminInventoryCounts(), searchParams,
  ]);
  if (!order?.payment) notFound();
  const action = adminOrderPaymentRecoveryAction({ orderStatus: order.status, orderPaymentStatus: order.paymentStatus,
    paymentStatus: order.payment.status, paymentMethod: order.payment.method, expiresAt: order.expiresAt, now: new Date() });
  const binance = order.payment.method === "BINANCE_INTERNAL";
  const attempt = binance ? order.binanceInternalPaymentAttempt : order.usdtBep20Attempt;
  const receiver = binance ? order.binanceInternalPaymentAttempt?.recipientBinanceIdSnapshot : order.usdtBep20Attempt?.recipientAddressSnapshot;
  const reference = binance ? order.binanceInternalPaymentAttempt?.submittedOrderId : order.usdtBep20Attempt?.txHash;
  const amount = attempt ? formatUsdtMicros(Number(attempt.expectedUsdtMicros)) : "Tidak tersedia";
  const returnTo = `/admin/orders/${order.id}/payment-approval`;
  return <AdminShell active="orders" counts={counts} email={admin.email} eyebrow="Konfirmasi pembayaran" title="Tinjau approval manual" description="Periksa bukti di akun penerima sebelum menyetujui pembayaran.">
    <p><Link href={`/admin/orders/${order.id}`} prefetch={false}>Kembali ke detail order</Link></p>
    {query.notice === "payment-confirmed" ? <p className="notice" role="status">Pembayaran disetujui. Stok dan pengiriman diproses melalui alur order yang sama.</p> : null}
    {query.error ? <p className="notice error" role="alert">{errors[query.error] ?? "Approval belum dapat diselesaikan. Periksa status dan referensi transaksi."}</p> : null}
    <section className="panel"><h2>{order.invoiceNumber}</h2>
      <p>Metode: <strong>{binance ? "Binance Pay" : "USDT BEP20"}</strong></p>
      <p>Nominal invoice: <strong>{amount}</strong></p><p>Penerima: <code>{receiver ?? "Tidak tersedia"}</code></p>
      <p>Batas pembayaran: {order.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p>
      {action.kind === "REVIEW_MANUAL_CRYPTO" && attempt ? <form action={`/api/admin/orders/${order.id}/confirm`} method="post" className="stack-form">
        <input type="hidden" name="returnTo" value={returnTo} />
        <label>{binance ? "Order ID / referensi Binance" : "Hash transaksi USDT BEP20"}<input name="reference" required defaultValue={reference ?? ""} maxLength={128} autoComplete="off" /></label>
        <label>Catatan pemeriksaan<textarea name="reason" required minLength={10} maxLength={500} placeholder="Nominal, penerima, dan bukti masuk yang telah Anda periksa" /></label>
        <p>Approval ini dicatat sebagai keputusan manual admin. Pastikan nominal {amount} benar-benar masuk ke penerima di atas. Status pemeriksaan otomatis tidak dijadikan bukti pembayaran manual.</p>
        <AdminConfirmSubmitButton title="Setujui pembayaran manual?" confirmText="Ya, pembayaran sudah saya periksa" description={`Saya telah memeriksa bahwa ${amount} masuk ke penerima invoice ini. Persetujuan akan memproses stok dan pengiriman produk.`}>Setujui pembayaran manual</AdminConfirmSubmitButton>
      </form> : <p>Invoice ini sudah dibayar, kedaluwarsa, atau tidak memenuhi syarat approval manual.</p>}
    </section>
  </AdminShell>;
}
