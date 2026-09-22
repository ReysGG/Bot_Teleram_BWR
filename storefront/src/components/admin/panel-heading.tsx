import type { ReactNode } from "react";

type PanelHeadingProps = {
  eyebrow?: string;
  title: string;
  icon?: ReactNode;
  trailing?: ReactNode;
};

export function PanelHeading({ eyebrow, title, icon, trailing }: PanelHeadingProps) {
  return (
    <div className="panel-heading">
      <div className="panel-heading-title">
        {icon ? <span className="panel-heading-icon">{icon}</span> : null}
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
      </div>
      {trailing}
    </div>
  );
}
