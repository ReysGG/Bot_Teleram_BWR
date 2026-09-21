import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { ShopeeSessionCreateForm } from "@/components/admin/shopee-session-create-form";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { listShopeePartnerSessions } from "@/server/payment/shopee-partner-session";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  "admin-session": "Sesi admin tidak valid. Masuk kembali lalu ulangi tindakan.",
  "admin-origin": "Permintaan ditolak karena origin admin tidak cocok.",
  "session-invalid": "Session tidak dapat disimpan. Periksa format cookie JSON dan token metadata.",
  "session-revoke": "Session tidak dapat dicabut. Muat ulang halaman dan coba lagi.",
};

function shortFingerprint(value: string | null): string {
  return value ? `${value.slice(0, 12)}...` : "sudah dihapus";
}

export default async function ShopeePaymentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const [counts, sessions] = await Promise.all([
    getAdminInventoryCounts(),
    listShopeePartnerSessions(),
  ]);
  return (
    <AdminShell
      active="paymentSettings"
      counts={counts}
      description="Simpan cookie dan token metadata secara terenkripsi. Kredensial baru tetap pending sampai identitas akun dan kontrak respons berhasil divalidasi."
      email={admin.email}
      eyebrow="Payment provider edit"
      title="Session Shopee Partner"
    >
      {query.notice === "session-created" ? <AdminResultModal message="Session disimpan terenkripsi dengan status pending validation. Checkout masih menggunakan bukti Android." tone="success" /> : null}
      {query.notice === "session-revoked" ? <AdminResultModal message="Session dicabut dan seluruh ciphertext cookie/token sudah dihapus dari record audit." tone="success" /> : null}
      {query.error ? <AdminResultModal message={errorMessages[query.error] ?? "Session Shopee Partner tidak dapat diproses."} tone="error" /> : null}
      <p><Link className="button button-small button-ghost" href="/admin/payment-settings" prefetch={false}>Kembali ke metode</Link> <Link className="button button-small" href="/admin/payments/shopee" prefetch={false}>Buka ledger Shopee</Link></p>
      <p className="alert alert-success"><ShieldCheck aria-hidden="true" size={18} /> Integrasi web masih fail-closed. Tidak ada transaksi yang dapat melunasi order sebelum parser respons, identitas merchant, matching ambigu-safe, dan konfirmasi atomik selesai diuji.</p>
      <section className="panel wide-panel">
        <div className="panel-heading"><div><p className="eyebrow">Encrypted credential vault</p><h2>Tambah session</h2></div></div>
        <ShopeeSessionCreateForm />
      </section>
      <section className="panel wide-panel">
        <div className="panel-heading"><div><p className="eyebrow">Session inventory</p><h2>Session tersimpan</h2></div><span className="status-pill status-neutral">{sessions.length}</span></div>
        {sessions.length === 0 ? <p>Belum ada session Shopee Partner.</p> : (
          <div className="table-scroll"><table><thead><tr><th>Nama</th><th>Status</th><th>Cookie</th><th>Token</th><th>Poll terakhir</th><th>Error aman</th><th>Aksi</th></tr></thead><tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>{session.name}</td>
                <td>{session.status}</td>
                <td><code>{shortFingerprint(session.cookieFingerprint)}</code></td>
                <td><code>{shortFingerprint(session.apiTokenFingerprint)}</code></td>
                <td>{session.lastSuccessfulPollAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-"}</td>
                <td>{session.lastErrorCode ?? "-"}</td>
                <td>{session.status === "REVOKED" ? "Dicabut" : <form action={`/api/admin/payment-settings/shopee/${session.id}`} method="post"><AdminConfirmSubmitButton className="button button-small button-ghost" confirmText="Ya, cabut dan hapus" description="Worker berhenti memakai session ini dan ciphertext cookie/token dihapus permanen. Record audit tanpa kredensial tetap disimpan." title="Cabut session Shopee Partner?">Cabut session</AdminConfirmSubmitButton></form>}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>
    </AdminShell>
  );
}
