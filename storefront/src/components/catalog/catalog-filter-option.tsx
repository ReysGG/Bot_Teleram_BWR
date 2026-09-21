import Link from "next/link";

export function CatalogFilterOption({
  active,
  count,
  href,
  label,
}: {
  active: boolean;
  count?: number;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={"filter-option" + (active ? " is-active" : "")}
      href={href}
    >
      <span className="filter-checkbox" aria-hidden="true" />
      <span className="filter-option-label">{label}</span>
      {typeof count === "number" ? <small>{count}</small> : null}
    </Link>
  );
}
