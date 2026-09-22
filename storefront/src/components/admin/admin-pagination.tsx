import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

function visiblePages(currentPage: number, totalPages: number): number[] {
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function adminPaginationHref({
  basePath,
  fragment,
  page,
  pageParam = "page",
  query,
}: {
  basePath: string;
  fragment?: string;
  page: number;
  pageParam?: string;
  query?: Record<string, string | undefined>;
}) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  if (page > 1) params.set(pageParam, String(page));
  const suffix = params.toString();
  const normalizedFragment = fragment?.trim().replace(/^#/, "") ?? "";
  const hash = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(normalizedFragment)
    ? `#${normalizedFragment}`
    : "";
  return `${suffix ? `${basePath}?${suffix}` : basePath}${hash}`;
}

export function AdminPagination({
  ariaLabel = "Pagination admin",
  basePath,
  currentPage,
  fragment,
  itemLabel = "file",
  pageSize,
  pageParam = "page",
  query,
  totalItems,
}: {
  ariaLabel?: string;
  basePath: string;
  currentPage: number;
  fragment?: string;
  itemLabel?: string;
  pageSize: number;
  pageParam?: string;
  query?: Record<string, string | undefined>;
  totalItems: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const firstItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);
  const href = (page: number) => adminPaginationHref({
    basePath,
    fragment,
    page,
    pageParam,
    query,
  });

  return (
    <nav aria-label={ariaLabel} className="admin-pagination">
      <span className="admin-pagination-summary">
        Menampilkan {firstItem}-{lastItem} dari {totalItems} {itemLabel}
      </span>
      <div className="admin-pagination-controls">
        {currentPage > 1 ? (
          <Link
            className="pagination-arrow"
            href={href(currentPage - 1)}
            prefetch={false}
            scroll={false}
          >
            <ChevronLeft aria-hidden="true" size={17} />
            Sebelumnya
          </Link>
        ) : (
          <span className="pagination-arrow is-disabled">
            <ChevronLeft aria-hidden="true" size={17} />
            Sebelumnya
          </span>
        )}
        {visiblePages(currentPage, totalPages).map((page) => (
          <Link
            aria-current={page === currentPage ? "page" : undefined}
            className={`pagination-page${page === currentPage ? " is-active" : ""}`}
            href={href(page)}
            key={page}
            prefetch={false}
            scroll={false}
          >
            {page}
          </Link>
        ))}
        {currentPage < totalPages ? (
          <Link
            className="pagination-arrow"
            href={href(currentPage + 1)}
            prefetch={false}
            scroll={false}
          >
            Berikutnya
            <ChevronRight aria-hidden="true" size={17} />
          </Link>
        ) : (
          <span className="pagination-arrow is-disabled">
            Berikutnya
            <ChevronRight aria-hidden="true" size={17} />
          </span>
        )}
      </div>
    </nav>
  );
}
