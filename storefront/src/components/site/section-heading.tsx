import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

export function SectionHeading({
  actionHref,
  actionLabel,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  title: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {actionHref && actionLabel ? <Link href={actionHref}>{actionLabel} <Icon aria-hidden="true" name="arrow-right" size={15} /></Link> : null}
    </div>
  );
}
