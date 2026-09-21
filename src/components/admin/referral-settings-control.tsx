"use client";

import { useEffect, useId, useState } from "react";
import { Gift, Settings2, X } from "lucide-react";

export function ReferralSettingsControl({
  enabled,
  pointsPerJoin,
  claimThresholdPoints,
  claimRewardAmount,
  newUserReward,
}: {
  enabled: boolean;
  pointsPerJoin: number;
  claimThresholdPoints: number;
  claimRewardAmount: number;
  newUserReward: number;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <>
      <section className={`maintenance-control${enabled ? "" : " is-enabled"}`}>
        <span className="maintenance-control-icon"><Gift aria-hidden="true" size={24} /></span>
        <div>
          <p className="eyebrow">Referral program</p>
          <h2>{enabled ? "Referral aktif" : "Referral dijeda"}</h2>
          <p>
            +{pointsPerJoin} poin per join. {claimThresholdPoints} poin dapat diclaim menjadi Rp{claimRewardAmount.toLocaleString("id-ID")}.
          </p>
        </div>
        <button className="button button-primary" type="button" onClick={() => setOpen(true)}>
          <Settings2 aria-hidden="true" size={17} /> Atur reward
        </button>
      </section>

      {open ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section aria-labelledby={titleId} aria-modal="true" className="admin-modal" role="dialog">
            <div className="admin-modal-heading">
              <div><p className="eyebrow">Reward configuration</p><h2 id={titleId}>Atur program referral</h2></div>
              <button aria-label="Tutup modal" className="modal-close" type="button" onClick={() => setOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <form action="/api/admin/referrals/settings" className="stack-form" method="post">
              <label className="checkbox-row">
                <input defaultChecked={enabled} name="enabled" type="checkbox" value="true" />
                <span>Program referral aktif</span>
              </label>
              <label>Poin per user baru<input defaultValue={pointsPerJoin} min="1" max="1000000" name="pointsPerJoin" required type="number" /></label>
              <label>Minimum poin untuk claim<input defaultValue={claimThresholdPoints} min="1" max="1000000" name="claimThresholdPoints" required type="number" /></label>
              <label>Reward wallet per claim<input defaultValue={claimRewardAmount} min="0" max="10000000" name="claimRewardAmount" required type="number" /></label>
              <label>Bonus wallet user baru<input defaultValue={newUserReward} min="0" max="10000000" name="newUserReward" required type="number" /></label>
              <p className="fine-print">Satu Telegram chat ID hanya dapat tercatat sebagai user referral satu kali. Retry Start dan retry claim tidak menggandakan poin atau saldo.</p>
              <div className="admin-modal-actions">
                <button className="button button-primary" type="submit"><Gift aria-hidden="true" size={17} /> Simpan pengaturan</button>
                <button className="button button-ghost" type="button" onClick={() => setOpen(false)}>Batal</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
