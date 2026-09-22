import Link from "next/link";
import { Activity, Clock3, ShieldCheck, TriangleAlert } from "lucide-react";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { BinanceWebSessionCreateForm } from "@/components/admin/binance-web-session-create-form";
import { MetricCard } from "@/components/admin/metric-card";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { getBinanceInternalSetting } from "@/server/payment/binance-internal-setting";
import { listBinanceWebSessions } from "@/server/payment/binance-web-session";
import { getBinanceWebErrorRateSnapshot, getBinanceWebSessionErrorRates } from "@/server/payment/binance-web-metrics";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  "admin-session": "Sesi admin tidak valid. Masuk kembali lalu ulangi tindakan.",
  "admin-origin": "Permintaan ditolak karena origin admin tidak cocok.",
  "recipient-required": "Isi Binance ID penerima sebelum menambahkan session.",
  "session-invalid": "Session tidak dapat disimpan. Periksa format cookie JSON Binance.",
  "session-duplicate": "Cookie session tersebut sudah tersimpan. Validasi atau cabut record yang ada, atau export session baru.",
  "session-validate": "Session belum dapat divalidasi. Periksa status aman pada tabel.",
  "session-auth": "Cookie Binance tidak diterima atau sudah kedaluwarsa. Export session baru dari akun penerima.",
  "session-challenge": "Binance meminta verifikasi browser/CAPTCHA. Selesaikan di akun Binance lalu export session baru.",
  "session-rate-limit": "Binance membatasi request sementara. Tunggu beberapa menit sebelum validasi ulang.",
  "session-identity": "Session dapat membaca Binance, tetapi Binance ID penerima belum dapat dibuktikan dari kontrak respons.",
  "session-account": "Session terbukti milik Binance ID yang berbeda dari konfigurasi toko.",
  "session-contract": "Format respons Binance berubah atau tidak dikenali. Session tidak diaktifkan.",
  "session-activate": "Session belum aktif, belum terikat ke penerima, atau tidak cocok dengan Binance ID saat ini.",
  "session-revoke": "Session tidak dapat dicabut. Muat ulang halaman dan coba lagi.",
};

function shortFingerprint(value: string | null): string {
  return value ? `${value.slice(0, 12)}...` : "-";
}

function statusTone(status: string, isPrimary: boolean) {
  if (status === "ACTIVE" && isPrimary) return "status-good";
  if (status === "CHALLENGED" || status === "ERROR" || status === "EXPIRED") {
    return "status-bad";
  }
  return "status-neutral";
}

function statusLabel(status: string, isPrimary: boolean) {
  if (isPrimary) return "Utama";
  const labels: Record<string, string> = {
    PENDING_VALIDATION: "Menunggu validasi",
    ACTIVE: "Aktif",
    CHALLENGED: "Perlu verifikasi",
    EXPIRED: "Perlu login ulang",
    ERROR: "Bermasalah",
    REVOKED: "Dicabut",
  };
  return labels[status] ?? status;
}

function safeErrorLabel(code: string | null) {
  if (!code) return "-";
  const labels: Record<string, string> = {
    AUTH_REQUIRED: "Cookie ditolak atau kedaluwarsa",
    RATE_LIMITED: "Request dibatasi sementara",
    UPSTREAM_CHALLENGE: "Binance meminta verifikasi/CAPTCHA",
    UPSTREAM_CONTRACT_UNKNOWN: "Format respons Binance berubah",
    UPSTREAM_RESPONSE_TOO_LARGE: "Respons melebihi batas aman",
    UPSTREAM_ERROR: "Binance belum dapat dihubungi",
    ACCOUNT_MISMATCH: "Binance ID session tidak cocok",
    ACCOUNT_IDENTITY_UNPROVEN: "Binance ID belum dapat dibuktikan",
    CREDENTIAL_DECRYPT_FAILED: "Credential vault tidak dapat dibuka",
    PERSIST_FAILED: "Bukti belum dapat disimpan",
  };
  return labels[code] ?? code;
}

function rateAccent(rate: number) {
  if (rate >= 25) return "accent-red";
  if (rate >= 5) return "accent-yellow";
  return "accent-green";
}

function formatRate(rate: number, runs: number) {
  return runs === 0 ? "Belum ada data" : `${rate.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}

export default async function BinanceWebSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const [counts, setting, sessions, reliability] = await Promise.all([
    getAdminInventoryCounts(),
    getBinanceInternalSetting(),
    listBinanceWebSessions(),
    getBinanceWebErrorRateSnapshot(),
  ]);
  const sessionReliability = await getBinanceWebSessionErrorRates(sessions.map((session) => session.id));
  const notices: Record<string, string> = {
    "session-created": "Session tersimpan terenkripsi. Jalankan validasi sebelum memilihnya untuk invoice baru.",
    "session-validated": "Session dan identitas akun berhasil divalidasi. Session dapat dipilih sebagai verifier utama.",
    "session-activated": "Session aktif dipilih sebagai verifier utama untuk Binance ID ini.",
    "session-revoked": "Session dicabut dan ciphertext cookie telah dihapus.",
  };
  return (
    <AdminShell
      active="paymentSettings"
      counts={counts}
      description="Kelola cookie terenkripsi untuk membaca Binance Pay Payment History tanpa API key. Aktivasi finansial tetap dipisahkan oleh feature gate."
      email={admin.email}
      eyebrow="Binance web verifier"
      title="Session Binance Pay"
    >
      {query.notice && notices[query.notice] ? (
        <AdminResultModal message={notices[query.notice]} tone="success" />
      ) : null}
      {query.error ? (
        <AdminResultModal
          message={errors[query.error] ?? "Session Binance tidak dapat diproses."}
          tone="error"
        />
      ) : null}
      <p>
        <Link className="button button-small button-ghost" href="/admin/payment-settings/binance" prefetch={false}>
          Kembali ke Binance Pay
        </Link>{" "}
        <Link className="button button-small" href="/admin/payments/binance" prefetch={false}>
          Buka ledger Binance
        </Link>
      </p>
      <p className="alert alert-success">
        <ShieldCheck aria-hidden="true" size={18} /> Cookie dienkripsi dengan
        payment-session key. API key Binance tidak dibutuhkan untuk jalur ini.
      </p>
      {!setting.recipientId ? (
        <p className="alert alert-error">
          <TriangleAlert aria-hidden="true" size={18} /> Konfigurasikan Binance ID
          penerima terlebih dahulu.
        </p>
      ) : null}
      <section className="metric-grid">
        <MetricCard
          accent={rateAccent(reliability.lastHour.errorRatePercent)}
          detail={`${reliability.lastHour.failedRuns} gagal dari ${reliability.lastHour.runs} poll`}
          icon={<Activity aria-hidden="true" />}
          label="Error rate 1 jam"
          value={formatRate(reliability.lastHour.errorRatePercent, reliability.lastHour.runs)}
        />
        <MetricCard
          accent={rateAccent(reliability.last24Hours.errorRatePercent)}
          detail={`${reliability.last24Hours.successfulRuns} sukses / ${reliability.last24Hours.failedRuns} gagal`}
          icon={<Clock3 aria-hidden="true" />}
          label="Error rate 24 jam"
          value={formatRate(reliability.last24Hours.errorRatePercent, reliability.last24Hours.runs)}
        />
        <MetricCard
          accent="accent-ink"
          detail={`${reliability.last24Hours.pages} halaman dipindai`}
          icon={<Activity aria-hidden="true" />}
          label="Total poll 24 jam"
          value={reliability.last24Hours.runs}
        />
        <MetricCard
          accent="accent-ink"
          detail={`${reliability.last24Hours.detailCalls} detail call`}
          icon={<ShieldCheck aria-hidden="true" />}
          label="Evidence 24 jam"
          value={reliability.last24Hours.received}
        />
        <MetricCard
          accent={reliability.last24Hours.lastErrorCode ? "accent-red" : "accent-green"}
          detail={reliability.last24Hours.lastErrorAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "Tidak ada error tercatat"}
          icon={<TriangleAlert aria-hidden="true" />}
          label="Error terakhir"
          value={safeErrorLabel(reliability.last24Hours.lastErrorCode)}
        />
      </section>
      <section className="panel wide-panel">
        <div className="panel-heading"><div><p className="eyebrow">Reliability breakdown</p><h2>Error polling Binance</h2></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kategori</th><th>1 jam</th><th>24 jam</th><th>Arti</th></tr></thead>
            <tbody>
              <tr><td>Cookie/auth</td><td>{reliability.lastHour.unauthorized}</td><td>{reliability.last24Hours.unauthorized}</td><td>Session ditolak atau kedaluwarsa</td></tr>
              <tr><td>Challenge</td><td>{reliability.lastHour.challenged}</td><td>{reliability.last24Hours.challenged}</td><td>Binance meminta verifikasi browser/CAPTCHA</td></tr>
              <tr><td>Rate limit</td><td>{reliability.lastHour.rateLimited}</td><td>{reliability.last24Hours.rateLimited}</td><td>Polling perlu menunggu sebelum retry</td></tr>
              <tr><td>Contract</td><td>{reliability.lastHour.contractUnknown}</td><td>{reliability.last24Hours.contractUnknown}</td><td>Respons tidak lagi sesuai parser aman</td></tr>
              <tr><td>Account mismatch</td><td>{reliability.lastHour.accountMismatch}</td><td>{reliability.last24Hours.accountMismatch}</td><td>Binance ID session berbeda dari penerima</td></tr>
              <tr><td>Identity unproven</td><td>{reliability.lastHour.identityUnproven}</td><td>{reliability.last24Hours.identityUnproven}</td><td>Session terbaca tetapi identitas belum cukup kuat</td></tr>
              <tr><td>Internal/upstream</td><td>{reliability.lastHour.errors}</td><td>{reliability.last24Hours.errors}</td><td>Network, database, atau worker gagal</td></tr>
            </tbody>
          </table>
        </div>
        <p className="fine-print">Error rate dihitung dari bucket lima menit. Satu poll dianggap gagal bila memiliki minimal satu kategori error; cookie, account ID, Order ID, dan payload mentah tidak disimpan di metrik.</p>
      </section>
      <section className="panel wide-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Encrypted credential vault</p><h2>Tambah session</h2></div>
        </div>
        <BinanceWebSessionCreateForm recipientBinanceId={setting.recipientId} />
      </section>
      <section className="panel wide-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Session inventory</p><h2>Session tersimpan</h2></div>
          <span className="status-pill status-neutral">{sessions.length}</span>
        </div>
        {sessions.length === 0 ? (
          <div className="empty-state"><strong>Belum ada session Binance.</strong><p>Tambahkan cookie setelah Binance ID penerima dikonfigurasi.</p></div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Session</th><th>Status</th><th>Binding</th><th>Poll terakhir</th><th>Error 24 jam</th><th>Error terakhir</th><th>Aksi</th></tr></thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td><strong>{session.name}</strong><br /><code>{shortFingerprint(session.cookieFingerprint)}</code></td>
                    <td><span className={`status-pill ${statusTone(session.status, session.isPrimary)}`}>{statusLabel(session.status, session.isPrimary)}</span></td>
                    <td>Binance ID {session.recipientBinanceId ?? "-"}<br /><code>{shortFingerprint(session.accountFingerprint)}</code></td>
                    <td>{session.lastSuccessfulPollAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-"}</td>
                    <td>{(() => { const metric = sessionReliability.get(session.id)?.last24Hours; return metric && metric.runs > 0 ? `${metric.errorRatePercent.toLocaleString("id-ID", { maximumFractionDigits: 2 })}% (${metric.failedRuns}/${metric.runs})` : "Belum ada data"; })()}</td>
                    <td>{safeErrorLabel(session.lastErrorCode)}</td>
                    <td>
                      {session.status === "REVOKED" ? "Dicabut" : (
                        <div className="admin-modal-actions">
                          <form action={`/api/admin/payment-settings/binance-web/${session.id}/validate`} method="post">
                            <AdminConfirmSubmitButton className="button button-small button-ghost" confirmText="Ya, validasi" description="Server membaca histori secara read-only dan tidak mengubah order atau payment." title="Validasi session Binance sekarang?">Validasi</AdminConfirmSubmitButton>
                          </form>
                          {session.status === "ACTIVE" && !session.isPrimary ? (
                            <form action={`/api/admin/payment-settings/binance-web/${session.id}/activate`} method="post">
                              <AdminConfirmSubmitButton className="button button-small" confirmText="Ya, pilih session" description="Hanya invoice baru yang memakai snapshot session ini. Auto-confirm tetap mengikuti feature gate server." title="Pilih sebagai session utama?">Pilih utama</AdminConfirmSubmitButton>
                            </form>
                          ) : null}
                          <form action={`/api/admin/payment-settings/binance-web/${session.id}/revoke`} method="post">
                            <AdminConfirmSubmitButton className="button button-small button-ghost" confirmText="Ya, cabut dan hapus" description="Ciphertext cookie dihapus permanen. Record audit dan transaksi yang sudah tersimpan tetap dipertahankan." title="Cabut session Binance?">Cabut</AdminConfirmSubmitButton>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
