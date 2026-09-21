import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { StorefrontProductGroup } from "@/lib/catalog-types";

const categoryThemes = ["category-blue", "category-mint", "category-violet", "category-orange"];

export function CategoryCard({
  group,
  index = 0,
}: {
  group: StorefrontProductGroup;
  index?: number;
}) {
  return (
    <Link className={"category-card " + categoryThemes[index % categoryThemes.length]} href={"/categories/" + group.slug}>
      <span className="category-icon" aria-hidden="true"><Icon name="sparkles" size={19} strokeWidth={2.1} /></span>
      <span>
        <strong>{group.name}</strong>
        <small>{group.productCount} produk · {group.description}</small>
      </span>
      <Icon aria-hidden="true" name="arrow-right" size={18} strokeWidth={2.2} />
    </Link>
  );
}
