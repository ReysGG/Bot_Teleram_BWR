import type { ReactNode } from "react";
import { Check, QrCode } from "lucide-react";

export type QrisSourceFact = {
  label: string;
  value: ReactNode;
};

export function QrisSourceCard({
  active,
  actions,
  description,
  disabled = false,
  facts,
  name,
  providerLabel,
  statusLabel,
  warning,
}: {
  active: boolean;
  actions: ReactNode;
  description: string;
  disabled?: boolean;
  facts: readonly QrisSourceFact[];
  name: string;
  providerLabel: string;
  statusLabel: string;
  warning?: ReactNode;
}) {
  return (
    <article className={`qris-source-card${active ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}>
      <div className="qris-source-card-heading">
        <span aria-hidden="true" className={`qris-source-radio${active ? " is-selected" : ""}`}>
          {active ? <Check size={16} strokeWidth={3} /> : null}
        </span>
        <span className="qris-source-card-icon"><QrCode aria-hidden="true" size={22} /></span>
        <div className="qris-source-card-title">
          <span className="qris-source-provider">{providerLabel}</span>
          <strong>{name}</strong>
        </div>
        <span className={`status-pill ${active ? "status-good" : disabled ? "status-bad" : "status-neutral"}`}>
          {statusLabel}
        </span>
      </div>

      <p className="qris-source-description">{description}</p>

      <dl className="qris-source-facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      {warning ? <div className="qris-source-warning">{warning}</div> : null}
      <div className="admin-modal-actions qris-source-actions">{actions}</div>
    </article>
  );
}
