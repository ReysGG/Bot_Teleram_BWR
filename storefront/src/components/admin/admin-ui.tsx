import type { ReactNode } from "react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminSearchForm } from "@/components/admin/admin-search-form";
import { EmptyState } from "@/components/admin/empty-state";
import { MetricCard } from "@/components/admin/metric-card";
import { PanelHeading } from "@/components/admin/panel-heading";

export { AdminPagination };
export { AdminSearchForm as AdminFilterBar };
export { EmptyState as AdminEmptyState };
export { MetricCard as AdminMetricCard };
export { PanelHeading as AdminPanelHeading };

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AdminMetricGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={joinClassNames("metric-grid", className)}>{children}</section>;
}

export function AdminPanel({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <section className={joinClassNames("panel", wide && "wide-panel", className)}>
      {children}
    </section>
  );
}

export function AdminTable({
  children,
  className,
  tableClassName,
}: {
  children: ReactNode;
  className?: string;
  tableClassName?: string;
}) {
  return (
    <div className={joinClassNames("table-wrap", className)}>
      <table className={tableClassName}>{children}</table>
    </div>
  );
}

type AdminStatusTone = "good" | "bad" | "warn" | "neutral";

export function AdminStatusPill({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: AdminStatusTone;
}) {
  return (
    <span className={joinClassNames("status-pill", `status-${tone}`, className)}>
      {children}
    </span>
  );
}
