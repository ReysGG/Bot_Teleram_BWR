import Link from "next/link";
import { Search } from "lucide-react";

export function AdminSearchForm({
  action,
  id,
  placeholder,
  value,
  hidden = {},
}: {
  action: string;
  id: string;
  placeholder: string;
  value: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} className="admin-search-form" method="get">
      {Object.entries(hidden).map(([name, hiddenValue]) =>
        hiddenValue ? (
          <input key={name} name={name} type="hidden" value={hiddenValue} />
        ) : null,
      )}
      <label className="visually-hidden" htmlFor={id}>Cari data</label>
      <input
        defaultValue={value}
        id={id}
        name="q"
        placeholder={placeholder}
        type="search"
      />
      <button className="button button-small" type="submit">
        <Search aria-hidden="true" size={16} /> Cari
      </button>
      {value ? (
        <Link className="button button-small button-ghost" href={action} prefetch={false}>Reset</Link>
      ) : null}
    </form>
  );
}
