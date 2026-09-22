import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminEmptyState, AdminPanel, AdminPanelHeading, AdminStatusPill, AdminTable } from "@/components/admin/admin-ui";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";
import { getSmsPoolHistory, calculateSmsPoolSellPrice } from "@/server/smspool/client";

export const dynamic = "force-dynamic";

function usd(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount) : "$0.00";
}

function idr(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export default async function SmsPoolHistoryPage() {
  const [admin, counts] = await Promise.all([requireAdminPage(), getAdminInventoryCounts()]);
  let history: Awaited<ReturnType<typeof getSmsPoolHistory>> = [];
  let providerUnavailable = false;
  try {
    history = await getSmsPoolHistory(100);
  } catch {
    providerUnavailable = true;
  }
  return (
    <AdminShell active="smspool" counts={counts} email={admin.email} eyebrow="SMS verification" title="Riwayat SMSPool" description="Riwayat provider dipisahkan dari order baru supaya pencarian dan audit tetap ringan.">
      <div className="seller-admin-actions"><Link className="button button-quiet" href="/admin/smspool"><ArrowLeft aria-hidden="true" size={16} /> Kembali ke SMSPool</Link></div>
      {providerUnavailable ? <p className="alert alert-error">Riwayat provider belum dapat dimuat. Coba lagi setelah provider tersedia.</p> : null}
      <AdminPanel wide>
        <AdminPanelHeading eyebrow="Provider history" icon={<History aria-hidden="true" />} title="Riwayat order" />
        {history.length === 0 ? <AdminEmptyState><strong>Riwayat belum tersedia.</strong></AdminEmptyState> : <AdminTable><thead><tr><th>Order</th><th>Nomor</th><th>Layanan</th><th>OTP</th><th>Status</th><th>Biaya provider</th><th>Harga jual</th><th>Waktu</th></tr></thead><tbody>{history.map((order) => <tr key={`${order.order_code}-${order.timestamp}`}><td>{order.order_code}</td><td>{order.phonenumber}</td><td>{order.service || "-"}</td><td>{order.code && order.code !== "0" ? order.code : "-"}</td><td><AdminStatusPill>{order.status}</AdminStatusPill></td><td>{usd(order.cost)}</td><td><strong>{idr(calculateSmsPoolSellPrice(order.cost))}</strong></td><td>{order.timestamp || "-"}</td></tr>)}</tbody></AdminTable>}
      </AdminPanel>
    </AdminShell>
  );
}
