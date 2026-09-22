import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { allowedPayoutActions, payoutActions } from "@/lib/seller-withdrawal-policy";

export function WithdrawalActions({ id, status, version }: { id: string; status: string; version: number }) {
  const actions = allowedPayoutActions(status);
  if (!actions.length) return <p>Tidak ada tindakan lanjutan untuk permintaan ini.</p>;
  return <div className="grid gap-5">{actions.map(action => {
    const policy = payoutActions[action];
    const formId = `withdrawal-${action}`;
    return <form key={action} id={formId} method="post" action={`/api/admin/sellers/withdrawals/${encodeURIComponent(id)}/action`} className="grid gap-3 rounded-2xl border border-[var(--line)] p-4">
      <input type="hidden" name="action" value={action} /><input type="hidden" name="version" value={version} />
      <h3>{policy.label}</h3>
      {policy.reason ? <label className="grid gap-2">Alasan<textarea name="reason" required minLength={5} maxLength={1000} rows={3} /></label> : null}
      {policy.reference ? <label className="grid gap-2">Referensi transfer berhasil<input name="reference" required maxLength={200} /></label> : null}
      <AdminConfirmSubmitButton formId={formId} title={`${policy.label}?`} confirmText="Simpan perubahan" description={action === "fail" || action === "reject" ? "Saldo yang ditahan akan dikembalikan ke saldo tersedia. Pastikan transfer memang tidak berhasil." : action === "paid" ? "Pastikan transfer sudah diterima rekening tujuan. Saldo yang ditahan akan diselesaikan." : action === "review" ? "Saldo tetap ditahan sampai hasil transfer dipastikan. Jangan mengirim transfer kedua." : "Keputusan dan identitas admin akan dicatat. Tombol ini tidak mengirim uang secara otomatis."}>{policy.label}</AdminConfirmSubmitButton>
    </form>;
  })}</div>;
}
