import Link from "next/link";
import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  accent: string;
  detail?: ReactNode;
  href?: string;
};

export function MetricCard({ label, value, icon, accent, detail, href }: MetricCardProps) {
  const className = `metric-card ${accent}${href ? " metric-link" : ""}`;
  const content = (
    <>
      <div className="metric-card-title">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </>
  );

  return href ? <Link className={className} href={href} prefetch={false}>{content}</Link> : <article className={className}>{content}</article>;
}
