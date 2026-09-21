import { AlertTriangle, FileKey, KeyRound, Send } from "lucide-react";
import { AccountRedeemDescriptionControl } from "@/components/admin/account-redeem-description-control";
import { AccountLoginUploadForm } from "@/components/admin/account-login-upload-form";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminSearchForm } from "@/components/admin/admin-search-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { prisma } from "@/server/db/prisma";
import { accountEmailHash, normalizeAccountEmail } from "@/server/redeem/account-login";
import {
  DEFAULT_ACCOUNT_REDEEM_DESCRIPTION,
  getAccountRedeemSettings,
  MAX_ACCOUNT_REDEEM_DESCRIPTION_LENGTH,
} from "@/server/redeem/settings";
import { ACCOUNT_REDEEM_VAULT_MISSING_KIND } from "@/server/redeem/missing-report";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

function numberParam(value: string | undefined) {
  return Number.parseInt(value ?? "0", 10) || 0;
}

const errorMessages: Record<string, string> = {
  "file-count": "Pilih minimal satu file TXT.",
  "file-type": "Upload data login hanya menerima file TXT.",
  "file-empty": "Salah satu file kosong.",
  "file-too-large": "Salah satu file melebihi 5 MB.",
  "row-limit": "Upload terlalu besar untuk diproses aman dalam satu permintaan.",
  "token-conflict": "Satu token sudah terhubung ke email berbeda. Seluruh proses dibatalkan.",
  description: "Deskripsi claim mail gagal disimpan. Pastikan teks tidak kosong dan tidak melebihi batas Telegram.",
  upload: "Data login gagal diproses. Pastikan file UTF-8 dan format tiap baris valid.",
};

export default async function RedeemAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const search = normalizeAdminSearch(query.q);
  const normalizedEmail = normalizeAccountEmail(search);
  const where = search
    ? normalizedEmail
      ? { emailHash: accountEmailHash(normalizedEmail) }
      : { sourceFilename: { contains: search, mode: "insensitive" as const } }
    : {};
  const [counts, totalItems, totalMappings, sentBatches, attentionBatches, redeemSettings, vaultMissingReports] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.accountLoginCredential.count({ where }),
    prisma.accountLoginCredential.count(),
    prisma.accountRedeemBatch.count({ where: { status: "SENT" } }),
    prisma.accountRedeemBatch.count({ where: { status: { in: ["FAILED", "UNKNOWN"] } } }),
    getAccountRedeemSettings(),
    prisma.telegramNotification.findMany({
      where: {
        kind: ACCOUNT_REDEEM_VAULT_MISSING_KIND,
        status: "MANUAL_REVIEW",
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        chatId: true,
        stockItemId: true,
        createdAt: true,
        order: {
          select: {
            invoiceNumber: true,
            buyerUsername: true,
            buyerDisplayName: true,
          },
        },
      },
    }),
  ]);
  const pagination = adminPagination(totalItems, parseAdminPage(query.page), 20);
  const credentials = await prisma.accountLoginCredential.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: pagination.skip,
    take: pagination.take,
    include: { _count: { select: { redeemEvents: true } } },
  });
  const uploadNotice = query.notice === "uploaded"
    ? `${numberParam(query.imported)} data login baru disimpan, ${numberParam(query.updated)} diperbarui, ${numberParam(query.unchanged)} tidak berubah. ${numberParam(query.invalid)} baris invalid, ${numberParam(query.duplicates)} duplikat identik, dan ${numberParam(query.conflicts)} konflik dilewati dari ${numberParam(query.processed)} baris.`
    : null;

  return (
    <AdminShell
      active="redeem"
      counts={counts}
      description="Vault terenkripsi untuk mengubah JSON Codex Free milik pembeli menjadi data login TXT tanpa membuka credential di dashboard."
      email={admin.email}
      eyebrow="Encrypted account recovery"
      title="Codex Free Login Vault"
    >
      {uploadNotice ? <AdminResultModal message={uploadNotice} tone="success" /> : null}
      {query.notice === "description-updated" ? (
        <AdminResultModal message="Deskripsi claim mail berhasil diperbarui." tone="success" />
      ) : null}
      {query.notice === "description-reset" ? (
        <AdminResultModal message="Deskripsi claim mail dikembalikan ke teks default." tone="success" />
      ) : null}
      {query.error ? (
        <AdminResultModal
          message={errorMessages[query.error] ?? errorMessages.upload}
          tone="error"
        />
      ) : null}

      <section className="metric-grid">
        <article className="metric-card accent-orange">
          <div className="metric-card-title"><span>Login tersimpan</span><KeyRound aria-hidden="true" /></div>
          <strong>{totalMappings}</strong>
        </article>
        <article className="metric-card accent-green">
          <div className="metric-card-title"><span>Batch terkirim</span><Send aria-hidden="true" /></div>
          <strong>{sentBatches}</strong>
        </article>
        <article className="metric-card accent-red">
          <div className="metric-card-title"><span>Perlu dicek</span><AlertTriangle aria-hidden="true" /></div>
          <strong>{attentionBatches + vaultMissingReports.length}</strong>
          <small>{vaultMissingReports.length} mapping vault belum tersedia</small>
        </article>
      </section>

      <AccountRedeemDescriptionControl
        defaultDescription={DEFAULT_ACCOUNT_REDEEM_DESCRIPTION}
        description={redeemSettings.description}
        isDefault={redeemSettings.isDefault}
        maxLength={MAX_ACCOUNT_REDEEM_DESCRIPTION_LENGTH}
        updatedAt={redeemSettings.updatedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? null}
      />

      <section className="panel panel-dark product-stock-intake">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><FileKey aria-hidden="true" /></span>
            <div><p className="eyebrow">Secure import</p><h2>Upload data login Outlook</h2></div>
          </div>
        </div>
        <AccountLoginUploadForm />
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Buyer reports</p><h2>Mapping vault belum tersedia</h2></div>
        </div>
        {vaultMissingReports.length === 0 ? (
          <div className="empty-state"><strong>Tidak ada laporan vault yang menunggu.</strong><p>Jika data login belum diimpor, bot akan mencatat laporan di sini tanpa menampilkan token.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Invoice</th><th>Pembeli</th><th>Stok</th><th>Dilaporkan</th></tr></thead>
              <tbody>
                {vaultMissingReports.map((report) => (
                  <tr key={report.id}>
                    <td><strong>{report.order?.invoiceNumber ?? "-"}</strong><small>Chat {report.chatId}</small></td>
                    <td>{report.order?.buyerUsername ? `@${report.order.buyerUsername}` : report.order?.buyerDisplayName ?? "-"}</td>
                    <td>{report.stockItemId ? `Stok ...${report.stockItemId.slice(-8)}` : "-"}</td>
                    <td>{report.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Vault audit</p><h2>Data login terenkripsi</h2></div>
          <AdminSearchForm
            action="/admin/redeem"
            id="redeem-search"
            placeholder="Email lengkap atau nama file sumber..."
            value={search}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Akun</th><th>Sumber</th><th>Redeem</th><th>Diperbarui</th></tr></thead>
            <tbody>
              {credentials.map((credential) => (
                <tr key={credential.id}>
                  <td><strong>{credential.emailMasked}</strong><small>Payload terenkripsi</small></td>
                  <td>{credential.sourceFilename}</td>
                  <td>{credential._count.redeemEvents}</td>
                  <td>{credential.updatedAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AdminPagination
          ariaLabel="Pagination data login"
          basePath="/admin/redeem"
          currentPage={pagination.page}
          itemLabel="data login"
          pageSize={pagination.pageSize}
          query={{ q: search || undefined }}
          totalItems={pagination.totalItems}
        />
      </section>
    </AdminShell>
  );
}
