import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminPaginationHref } from "@/components/admin/admin-pagination";
import { dashboardTransactionHref } from "@/components/admin/dashboard/dashboard-transactions";
import { adminSearchHref } from "@/components/admin/admin-search-navigation";

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("admin navigation state", () => {
  it("keeps both dashboard sheet positions in an action return path", () => {
    expect(dashboardTransactionHref({
      orderPage: 3,
      orderSearch: "buyer",
      sheet: "topups",
      topupPage: 4,
      topupSearch: "TGS-123",
      topupStatus: "problem",
    })).toBe(
      "/admin?page=3&q=buyer&sheet=topups&topupPage=4&topupQ=TGS-123&topupStatus=problem#wallet-topups",
    );
  });

  it("keeps pagination on its own section anchor", () => {
    expect(adminPaginationHref({
      basePath: "/admin/wallet",
      fragment: "topup-history",
      page: 5,
      pageParam: "topupPage",
      query: { page: "2", q: "buyer" },
    })).toBe("/admin/wallet?page=2&q=buyer&topupPage=5#topup-history");
  });

  it("keeps a search form anchor while resetting the searched page", () => {
    expect(adminSearchHref(
      "/admin/payments/reconciliation#reconciliation-ledger",
      "https://store.example/admin/payments/reconciliation?page=8",
      [["q", "invoice"], ["status", "problem"]],
    )).toBe(
      "/admin/payments/reconciliation?q=invoice&status=problem#reconciliation-ledger",
    );
  });

  it("disables automatic prefetch for every admin link", () => {
    for (const file of [
      ...tsxFiles(join(process.cwd(), "src/app/admin")),
      ...tsxFiles(join(process.cwd(), "src/components/admin")),
    ]) {
      const source = readFileSync(file, "utf8");
      if (file.endsWith("admin-navigation-link.tsx")) {
        // The sidebar may opt in only after pointer/keyboard/touch intent.
        expect(source).toContain("useState(false)");
        expect(source).toContain("prefetch={intent}");
        continue;
      }
      const links = source.match(/<Link(?=[\s>])[^>]*>/gs) ?? [];
      expect(links, file).toEqual(
        links.map((link) => expect.stringContaining("prefetch={false}")),
      );
    }
  });

  it("keeps the real sidebar visible while only page content is loading", () => {
    const skeleton = readFileSync(
      join(process.cwd(), "src/components/admin/admin-page-skeleton.tsx"),
      "utf8",
    );
    const shell = readFileSync(
      join(process.cwd(), "src/components/admin/admin-shell.tsx"),
      "utf8",
    );

    expect(skeleton).toContain("<AdminSidebar active={active} />");
    expect(skeleton).not.toContain("SkeletonSidebar");
    expect(skeleton).not.toContain("admin-skeleton-sidebar");
    expect(shell).toContain("<AdminSidebar active={active} counts={counts} email={email} />");
  });
});
