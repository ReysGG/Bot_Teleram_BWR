import type { ReactNode } from "react";
import type { AdminInventoryCounts } from "@/server/admin/inventory";
import { AdminSearchNavigation } from "@/components/admin/admin-search-navigation";
import {
  AdminSidebar,
  type AdminSection,
} from "@/components/admin/admin-sidebar";
import { AdminTableSorter } from "@/components/admin/admin-table-sorter";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

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
    <><SiteHeader active="account" /><main className="admin-layout">
      <AdminSearchNavigation />
      <AdminSidebar active={active} counts={counts} email={email} />

      <section className="admin-content">
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
    </main><SiteFooter /></>
  );
}
