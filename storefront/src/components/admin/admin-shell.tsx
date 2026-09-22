import type { ReactNode } from "react";
import type { AdminInventoryCounts } from "@/server/admin/inventory";
import { AdminSearchNavigation } from "@/components/admin/admin-search-navigation";
import {
  AdminSidebar,
  type AdminSection,
} from "@/components/admin/admin-sidebar";
import { AdminTableSorter } from "@/components/admin/admin-table-sorter";

export function AdminShell({
  active,
  email,
  counts,
  eyebrow,
  title,
  description,
  headerVariant = "default",
  children,
}: {
  active: AdminSection;
  email: string;
  counts: AdminInventoryCounts;
  eyebrow: string;
  title: string;
  description?: string;
  headerVariant?: "default" | "compact";
  children: ReactNode;
}) {
  return (
    <main className="admin-layout">
      <AdminSearchNavigation />
      <AdminSidebar active={active} counts={counts} email={email} />

      <section className="admin-content">
        <div className="admin-management-bar"><strong>BWR TELE Admin</strong><span>Local management workspace</span></div>
        <AdminTableSorter />
        <header className={`admin-page-header${headerVariant === "compact" ? " is-compact" : ""}`}>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            {description ? <p className="admin-description">{description}</p> : null}
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
