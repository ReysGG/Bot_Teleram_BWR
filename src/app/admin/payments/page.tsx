import Link from "next/link";
import {
  ArrowRight,
  Blocks,
  Landmark,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Store,
  WalletCards,
} from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { PaymentOperationsNav } from "@/components/admin/payment-operations-nav";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const admin = await requireAdminPage();
  const [counts, rejectedEvents, activeQris, activeJago, activeBinance, activeUsdt, activeShopee] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.bridgePaymentEvent.count({ where: { status: "REJECTED" } }),
    prisma.qrisInvoiceAttempt.count({ where: { status: { in: ["AWAITING_PAYMENT", "MATCHED"] } } }),
    prisma.jagoTransferAttempt.count({ where: { status: "AWAITING_TRANSFER" } }),
    prisma.binanceInternalPaymentAttempt.count({ where: { status: { in: ["AWAITING_ORDER_ID", "VERIFYING", "VERIFIED"] } } }),
    prisma.usdtBep20Attempt.count({ where: { status: { in: ["AWAITING_TX_HASH", "VERIFYING", "PENDING_CONFIRMATIONS", "VERIFIED"] } } }),
    prisma.shopeePartnerSession.count({ where: { status: { in: ["PENDING_VALIDATION", "ACTIVE", "ERROR"] } } }),
  ]);
  const sections = [
    {
      href: "/admin/payments/reconciliation",
      label: "Rekonsiliasi event",
      description: "Cocokkan event DANA atau Bank Jago yang ditolak ke order/top up yang benar.",
      count: rejectedEvents,
      icon: RefreshCw,
    },
    {
      href: "/admin/payments/qris",
      label: "Riwayat QRIS",
      description: "Audit merchant snapshot, provider/package, nominal, event, order, dan top up wallet.",
      count: activeQris,
      icon: QrCode,
    },
    {
      href: "/admin/payments/jago",
      label: "Riwayat Bank Jago",
      description: "Lihat transfer aktif, event yang cocok, approval manual, dan order terkait.",
      count: activeJago,
      icon: Landmark,
    },
    {
      href: "/admin/payments/binance",
      label: "Riwayat Binance Pay",
      description: "Pantau Order ID dan hasil verifier API read-only tanpa bypass manual.",
      count: activeBinance,
      icon: WalletCards,
    },
    {
      href: "/admin/payments/usdt-bep20",
      label: "Riwayat USDT BEP20",
      description: "Pantau tx hash, blok, konfirmasi jaringan, dan pemeriksaan ulang provider.",
      count: activeUsdt,
      icon: Blocks,
    },
    {
      href: "/admin/payments/shopee",
      label: "Riwayat Shopee Partner",
      description: "Pantau session web terenkripsi, status polling, dan bukti transaksi yang sudah dinormalisasi.",
      count: activeShopee,
      icon: Store,
    },
  ];

  return (
    <AdminShell
      active="payments"
      counts={counts}
      description="Pilih jalur pembayaran yang ingin diaudit. Konfigurasi/edit provider berada di halaman Metode pembayaran agar tidak bercampur dengan riwayat transaksi."
      email={admin.email}
      eyebrow="Payment operations"
      title="Operasi pembayaran"
    >
      <PaymentOperationsNav active="hub" />
      <section className="panel wide-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Focused workspaces</p><h2>Pilih fungsi yang dikerjakan</h2></div>
          <Link className="button button-small" href="/admin/payment-settings" prefetch={false}>Edit metode <ArrowRight aria-hidden="true" size={16} /></Link>
        </div>
        <p className="payment-method-intro">Setiap provider dan rekonsiliasi memiliki halaman sendiri supaya filter, aksi, serta hasil operasi tidak saling menimpa.</p>
        <div className="dashboard-action-grid">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Link className="dashboard-action-card" href={section.href} prefetch={false} key={section.href}>
                <Icon aria-hidden="true" />
                <strong>{section.label}</strong>
                <span>{section.description}</span>
                <span className={section.count > 0 ? "status-pill status-warn" : "status-pill status-good"}>{section.count} aktif/perlu review</span>
              </Link>
            );
          })}
        </div>
      </section>
      <p className="alert alert-success"><ShieldCheck aria-hidden="true" size={18} /> Binance dan USDT tetap verifier-only. Approval manual hanya tersedia untuk jalur transfer Rupiah yang memang diizinkan policy.</p>
    </AdminShell>
  );
}
