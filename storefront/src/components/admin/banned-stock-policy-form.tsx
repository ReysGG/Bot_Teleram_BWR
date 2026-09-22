import { ChevronDown, Save, ShieldAlert } from "lucide-react";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";

type BannedStockPolicy = "BLOCKED" | "ALLOW_HTTP_401" | "OWNER_APPROVAL" | "RELOGIN_REQUIRED";

const policyLabels: Record<BannedStockPolicy, string> = {
  BLOCKED: "Diblokir",
  ALLOW_HTTP_401: "HTTP 401 bisa dijual",
  OWNER_APPROVAL: "Izin owner",
  RELOGIN_REQUIRED: "Wajib relogin",
};

function PolicyForm({
  product,
}: {
  product: { id: string; bannedStockPolicy: BannedStockPolicy };
}) {
  return (
    <form action={`/api/admin/products/${product.id}/banned-policy`} className="stack-form" method="post">
      <label>
        Penanganan akun HTTP 401/402
        <select defaultValue={product.bannedStockPolicy} name="bannedStockPolicy">
          <option value="BLOCKED">Blokir - tidak dapat dijual saat banned</option>
          <option value="ALLOW_HTTP_401">Izinkan HTTP 401 - otomatis dapat dijual</option>
          <option value="OWNER_APPROVAL">Izin owner 401/402 - pilih stok satu per satu</option>
          <option value="RELOGIN_REQUIRED">Relogin wajib - edit credential sampai sehat</option>
        </select>
      </label>
      <p className="fine-print">
        HTTP 401 dapat dijual otomatis hanya saat opsi tersebut aktif; HTTP 402 tetap diblokir. Riwayat stok yang sudah delivered tidak pernah dijual ulang. Mengubah policy dari Izin owner akan mencabut semua izin stok yang belum dialokasikan.
      </p>
      <AdminConfirmSubmitButton
        confirmText="Ya, simpan aturan"
        description="Perubahan ini memengaruhi kelayakan jual stok HTTP 401/402 dan dapat mencabut izin owner pada stok yang belum dialokasikan."
        title="Simpan aturan stok banned?"
      >
        <Save aria-hidden="true" size={17} /> Simpan aturan banned
      </AdminConfirmSubmitButton>
    </form>
  );
}

export function BannedStockPolicyForm({
  compact = false,
  product,
}: {
  compact?: boolean;
  product: {
    id: string;
    bannedStockPolicy: BannedStockPolicy;
  };
}) {
  if (compact) {
    return (
      <details className="banned-stock-policy-card banned-stock-policy-compact">
        <summary>
          <span className="banned-policy-summary-icon"><ShieldAlert aria-hidden="true" /></span>
          <span className="banned-policy-summary-copy">
            <span className="eyebrow">Pengaturan lanjutan</span>
            <strong>Aturan stok banned</strong>
            <small>Kebijakan saat checker menemukan HTTP 401/402.</small>
          </span>
          <span className="banned-policy-current">{policyLabels[product.bannedStockPolicy]}</span>
          <ChevronDown aria-hidden="true" className="banned-policy-chevron" size={19} />
        </summary>
        <div className="banned-policy-body">
          <PolicyForm product={product} />
        </div>
      </details>
    );
  }

  return (
    <section className="panel banned-stock-policy-card">
      <div className="panel-heading">
        <div className="panel-heading-title">
          <span className="panel-heading-icon"><ShieldAlert aria-hidden="true" /></span>
          <div><p className="eyebrow">Banned recovery</p><h2>Aturan stok banned</h2></div>
        </div>
      </div>
      <PolicyForm product={product} />
    </section>
  );
}
