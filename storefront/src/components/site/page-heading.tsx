import type { ReactNode } from "react";
import Image from "next/image";

export function PageHeading({
  action,
  breadcrumbs,
  description,
  imageAlt = "",
  imageFit = "cover",
  imageMode = "split",
  imageTreatment = "default",
  imageUrl,
  title,
  variant = "band",
}: {
  action?: ReactNode;
  breadcrumbs?: ReactNode;
  description: ReactNode;
  imageAlt?: string;
  imageFit?: "contain" | "cover";
  imageMode?: "background" | "split";
  imageTreatment?: "default" | "natural";
  imageUrl?: string | null;
  title: ReactNode;
  variant?: "band" | "plain";
}) {
  const resolvedImageUrl = imageUrl || "/placeholders/shop-heading.svg";
  const visual = (
    <div className="page-heading-visual">
      <Image
        alt={imageAlt}
        fill
        priority
        sizes={imageMode === "split" ? "(max-width: 860px) 100vw, 50vw" : "100vw"}
        src={resolvedImageUrl}
        unoptimized={!resolvedImageUrl.startsWith("/") || resolvedImageUrl.startsWith("//")}
      />
    </div>
  );

  return (
    <section className={"page-heading page-heading-" + variant + " page-heading-image-" + imageMode + " page-heading-fit-" + imageFit + " page-heading-treatment-" + imageTreatment}>
      {imageMode === "background" ? visual : null}
      <div className="page-heading-inner">
        <div className="page-heading-copy">
          {breadcrumbs ? <div className="breadcrumbs">{breadcrumbs}</div> : null}
          <h1>{title}</h1>
          <p>{description}</p>
          {action ? <div className="page-heading-action">{action}</div> : null}
        </div>
        {imageMode === "split" ? visual : null}
      </div>
    </section>
  );
}
