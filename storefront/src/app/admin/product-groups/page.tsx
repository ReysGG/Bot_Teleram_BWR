import Link from "next/link";
import { Layers3, Pencil, PlusCircle } from "lucide-react";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  AdminMetricCard,
  AdminMetricGrid,
  AdminPagination,
  AdminPanel,
  AdminPanelHeading,
  AdminStatusPill,
  AdminTable,
} from "@/components/admin/admin-ui";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { Prisma } from "@/generated/prisma/client";
import { ProductStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

type GroupSort = "order" | "name" | "status" | "products" | "date";

function parseSort(value: string | undefined): GroupSort {
  return ["order", "name", "status", "products", "date"].includes(value ?? "")
    ? value as GroupSort
    : "order";
}

export default async function ProductGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    page?: string;
    q?: string;
    status?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const search = normalizeAdminSearch(query.q);
  const status = query.status === "ACTIVE" || query.status === "INACTIVE"
    ? query.status as ProductStatus
    : undefined;
  const sort = parseSort(query.sort);
  const direction = query.dir === "desc" ? "desc" as const : "asc" as const;
  const where: Prisma.ProductGroupWhereInput = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { descriptionEn: { contains: search, mode: "insensitive" as const } },
            { products: { some: { name: { contains: search, mode: "insensitive" as const } } } },
            { products: { some: { variantLabel: { contains: search, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };
  const [counts, totalItems, totalGroups, activeGroups, groupedProducts] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.productGroup.count({ where }),
    prisma.productGroup.count(),
    prisma.productGroup.count({ where: { status: "ACTIVE" } }),
    prisma.product.count({ where: { groupId: { not: null } } }),
  ]);
  const pagination = adminPagination(totalItems, parseAdminPage(query.page), 15);
  const orderBy: Prisma.ProductGroupOrderByWithRelationInput[] = sort === "name"
    ? [{ name: direction }, { id: "asc" as const }]
    : sort === "status"
      ? [{ status: direction }, { name: "asc" as const }]
      : sort === "products"
        ? [{ products: { _count: direction } }, { name: "asc" as const }]
        : sort === "date"
          ? [{ createdAt: direction }, { id: "asc" as const }]
          : [{ sortOrder: direction }, { name: "asc" as const }];
  const groups = await prisma.productGroup.findMany({
    where,
    orderBy,
    skip: pagination.skip,
    take: pagination.take,
    include: {
      _count: { select: { products: true } },
      products: {
        orderBy: [{ groupSortOrder: "asc" }, { name: "asc" }],
        take: 4,
        select: { id: true, name: true, variantLabel: true, status: true },
      },
    },
  });

  return (
    <AdminShell
      active="productGroups"
      counts={counts}
      description="Kelola parent katalog seperti ChatGPT, lalu tempatkan K12, Team, dan Codex Free sebagai varian terpisah."
      email={admin.email}
      eyebrow="Catalog hierarchy"
      title="Grup & varian"
    >
      {query.notice === "group-created" ? <AdminResultModal message="Grup produk berhasil dibuat." tone="success" /> : null}
      {query.notice === "group-deleted" ? <AdminResultModal message="Grup produk berhasil dihapus." tone="success" /> : null}
      {query.error ? (
        <AdminResultModal
          message={query.error === "in-use"
            ? "Grup masih memiliki varian. Pindahkan atau lepaskan semua produk terlebih dahulu."
            : "Grup produk gagal diproses."}
          tone="error"
        />
      ) : null}

      <div className="product-page-toolbar">
        <div><strong>Parent katalog dan varian.</strong><span className="muted">Produk tanpa grup tetap tampil sebagai produk standalone.</span></div>
        <Link className="button button-primary" href="/admin/product-groups/new" prefetch={false}>
          <PlusCircle aria-hidden="true" size={18} /> Tambah grup
        </Link>
      </div>

      <AdminMetricGrid>
        <AdminMetricCard accent="accent-ink" icon={<Layers3 aria-hidden="true" />} label="Total grup" value={totalGroups} />
        <AdminMetricCard accent="accent-green" icon={<Layers3 aria-hidden="true" />} label="Grup aktif" value={activeGroups} />
        <AdminMetricCard accent="accent-orange" icon={<Layers3 aria-hidden="true" />} label="Produk dikelompokkan" value={groupedProducts} />
      </AdminMetricGrid>

      <AdminPanel wide>
        <AdminPanelHeading eyebrow="Catalog groups" icon={<Layers3 aria-hidden="true" />} title="Daftar grup" />
        <form action="/admin/product-groups" className="admin-search-form" method="get">
          <input defaultValue={search} name="q" placeholder="Cari grup atau nama varian..." type="search" />
          <select defaultValue={status ?? ""} name="status">
            <option value="">Semua status</option>
            <option value="ACTIVE">Aktif</option>
            <option value="INACTIVE">Nonaktif</option>
          </select>
          <select defaultValue={sort} name="sort">
            <option value="order">Urutan katalog</option>
            <option value="name">Nama</option>
            <option value="status">Status</option>
            <option value="products">Jumlah varian</option>
            <option value="date">Tanggal dibuat</option>
          </select>
          <select defaultValue={direction} name="dir">
            <option value="asc">Naik</option>
            <option value="desc">Turun</option>
          </select>
          <button className="button button-small" type="submit">Terapkan</button>
          {search || status || sort !== "order" || direction !== "asc" ? <Link className="button button-small button-ghost" href="/admin/product-groups" prefetch={false}>Reset</Link> : null}
        </form>

        <AdminTable tableClassName="product-group-table">
          <thead><tr><th>Grup</th><th>Urutan</th><th>Varian</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id}>
                <td><strong>{group.name}</strong><small>{group.slug}</small></td>
                <td>{group.sortOrder}</td>
                <td>
                  <strong>{group._count.products} produk</strong>
                  <small>{group.products.map((product) => product.variantLabel ?? product.name).join(", ") || "Belum ada varian"}{group._count.products > group.products.length ? ", ..." : ""}</small>
                </td>
                <td><AdminStatusPill tone={group.status === "ACTIVE" ? "good" : "neutral"}>{group.status}</AdminStatusPill></td>
                <td><Link className="button button-small" href={`/admin/product-groups/${group.id}/edit`} prefetch={false}><Pencil aria-hidden="true" size={15} /> Kelola</Link></td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
        <AdminPagination
          ariaLabel="Pagination grup produk"
          basePath="/admin/product-groups"
          currentPage={pagination.page}
          itemLabel="grup"
          pageSize={pagination.pageSize}
          query={{ q: search || undefined, status, sort: sort === "order" ? undefined : sort, dir: direction === "asc" ? undefined : direction }}
          totalItems={pagination.totalItems}
        />
      </AdminPanel>
    </AdminShell>
  );
}
