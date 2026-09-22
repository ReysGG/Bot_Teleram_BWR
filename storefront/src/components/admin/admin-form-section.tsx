import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function AdminFormSection({
  eyebrow,
  title,
  description,
  icon,
  children,
  className = "",
  collapsible = false,
  defaultOpen = false,
  status,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  status?: string;
}) {
  const heading = (
    <>
      {icon ? <span className="admin-form-section-icon">{icon}</span> : null}
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {status ? <span className="admin-form-section-status">{status}</span> : null}
      {collapsible ? <ChevronDown aria-hidden="true" className="admin-form-section-chevron" /> : null}
    </>
  );

  if (collapsible) {
    return (
      <details className={`admin-form-section is-collapsible${className ? ` ${className}` : ""}`} open={defaultOpen}>
        <summary className="admin-form-section-heading">{heading}</summary>
        <div className="admin-form-section-body">{children}</div>
      </details>
    );
  }

  return (
    <section className={`admin-form-section${className ? ` ${className}` : ""}`}>
      <header className="admin-form-section-heading">{heading}</header>
      <div className="admin-form-section-body">{children}</div>
    </section>
  );
}
