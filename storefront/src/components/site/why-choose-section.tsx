import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";

const benefits: Array<{
  description: string;
  href: string;
  icon: IconName;
  number: string;
  theme: string;
  title: string;
}> = [
  {
    description: "Lihat ketersediaan produk sebelum memilih.",
    href: "/shop?availability=ready",
    icon: "cube",
    number: "01",
    theme: "blue",
    title: "Stok jelas",
  },
  {
    description: "Nominal dan metode pembayaran divalidasi ulang.",
    href: "/shop",
    icon: "shield-check",
    number: "02",
    theme: "green",
    title: "Checkout aman",
  },
  {
    description: "Produk digital tersedia melalui akses privat pesananmu.",
    href: "/orders",
    icon: "send",
    number: "03",
    theme: "orange",
    title: "Delivery privat",
  },
];

export function WhyChooseSection() {
  return (
    <section className="why-section page-width" aria-labelledby="why-title">
      <div className="why-copy">
        <p className="why-eyebrow">Why BWR Tele?</p>
        <h2 id="why-title">
          Kenapa pilih BWR Tele?
          <em>Lebih jelas dari awal sampai selesai.</em>
        </h2>
        <p>Belanja produk digital jadi lebih mudah, aman, dan nyaman bersama BWR Tele.</p>
      </div>

      <div className="why-grid">
        {benefits.map((benefit) => (
          <Link className="why-card" href={benefit.href} key={benefit.number}>
            <span className={`why-card-icon why-card-icon-${benefit.theme}`}>
              <Icon aria-hidden="true" name={benefit.icon} size={25} strokeWidth={2.1} />
            </span>
            <span className="why-card-copy">
              <span className="why-card-title">
                <b>{benefit.number}</b>
                <strong>{benefit.title}</strong>
              </span>
              <span className="why-card-description">{benefit.description}</span>
            </span>
            <Icon
              aria-hidden="true"
              className="why-card-chevron"
              name="chevron-right"
              size={18}
              strokeWidth={2.2}
            />
          </Link>
        ))}
      </div>

      <div className="why-visual" aria-hidden="true">
        <span className="why-safe-badge">
          <span><Icon name="check" size={14} strokeWidth={3} /></span>
          Mudah &amp; Aman!
        </span>
        <Image
          alt=""
          height={700}
          sizes="260px"
          src="/why/why-character.webp"
          width={600}
        />
      </div>
    </section>
  );
}
