import {
  AdminSidebar,
  type AdminSection,
} from "@/components/admin/admin-sidebar";

type AdminSkeletonVariant = "dashboard" | "table" | "warehouse" | "workspace";

function SkeletonLine({ width = "100%" }: { width?: string }) {
  return <span className="admin-skeleton-line" style={{ width }} />;
}

function SkeletonHeader() {
  return (
    <header className="admin-page-header admin-skeleton-header" aria-hidden="true">
      <div>
        <SkeletonLine width="92px" />
        <SkeletonLine width="min(360px, 72vw)" />
        <SkeletonLine width="min(540px, 82vw)" />
      </div>
    </header>
  );
}

function SkeletonMetrics({ count = 5 }: { count?: number }) {
  return (
    <section className="metric-grid admin-skeleton-metrics" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <article className="metric-card admin-skeleton-card" key={index}>
          <SkeletonLine width={`${82 + (index % 3) * 18}px`} />
          <SkeletonLine width={`${54 + (index % 2) * 22}px`} />
        </article>
      ))}
    </section>
  );
}

function SkeletonPanel({ rows = 6 }: { rows?: number }) {
  return (
    <section className="panel wide-panel admin-skeleton-panel" aria-hidden="true">
      <div className="admin-skeleton-panel-heading">
        <div><SkeletonLine width="90px" /><SkeletonLine width="220px" /></div>
        <SkeletonLine width="118px" />
      </div>
      <div className="admin-skeleton-table">
        {Array.from({ length: rows }, (_, index) => (
          <div className="admin-skeleton-table-row" key={index}>
            <SkeletonLine width="26%" />
            <SkeletonLine width="18%" />
            <SkeletonLine width="22%" />
            <SkeletonLine width="12%" />
          </div>
        ))}
      </div>
    </section>
  );
}

function SkeletonWorkspace() {
  return (
    <div className="admin-skeleton-workspace" aria-hidden="true">
      <section className="panel admin-skeleton-panel">
        <SkeletonLine width="190px" />
        <SkeletonLine width="100%" />
        <SkeletonLine width="88%" />
        <SkeletonLine width="72%" />
      </section>
      <section className="panel admin-skeleton-panel">
        <SkeletonLine width="150px" />
        <SkeletonLine width="100%" />
        <SkeletonLine width="100%" />
        <SkeletonLine width="64%" />
      </section>
    </div>
  );
}

export function AdminPageSkeleton({
  active,
  variant = "dashboard",
}: {
  active?: AdminSection;
  variant?: AdminSkeletonVariant;
}) {
  return (
    <main className="admin-layout admin-skeleton-layout" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Memuat halaman admin...</span>
      <AdminSidebar active={active} />
      <section className="admin-content">
        <SkeletonHeader />
        {variant === "workspace" ? (
          <SkeletonWorkspace />
        ) : (
          <>
            <SkeletonMetrics count={variant === "warehouse" ? 5 : 4} />
            {variant === "warehouse" ? <SkeletonWorkspace /> : null}
            <SkeletonPanel rows={variant === "dashboard" ? 5 : 8} />
          </>
        )}
      </section>
    </main>
  );
}
