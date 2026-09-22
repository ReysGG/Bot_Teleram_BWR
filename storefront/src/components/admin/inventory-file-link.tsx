import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { maskInventoryFilename } from "@/server/admin/inventory";
import { buildAdminReturnPath } from "@/server/admin/return-path";

export function InventoryFileLink({
  id,
  filename,
  returnQuery = {},
  returnTo,
}: {
  id: string;
  filename: string;
  returnQuery?: Record<string, string | undefined>;
  returnTo: string;
}) {
  const returnUrl = buildAdminReturnPath({
    pathname: returnTo,
    query: returnQuery,
    fragment: returnTo.includes("#inventory-ledger") ? "inventory-ledger" : undefined,
  });
  return (
    <Link
      className="inventory-file-link"
      href={{ pathname: `/admin/inventory/${id}`, query: { returnTo: returnUrl } }}
      prefetch={false}
      title="Buka isi dan detail file"
    >
      <strong>{maskInventoryFilename(filename)}</strong>
      <ExternalLink aria-hidden="true" size={14} />
    </Link>
  );
}
