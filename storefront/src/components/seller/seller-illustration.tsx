import Image from "next/image";

type SellerIllustrationVariant = "login" | "products-empty" | "payout" | "review";

const ARTWORK: Record<SellerIllustrationVariant, { src: string; alt: string }> = {
  login: {
    src: "/auth/auth-character-scene.webp",
    alt: "Ilustrasi ruang kerja seller BWR Tele",
  },
  "products-empty": {
    src: "/account/account-package.png",
    alt: "Ilustrasi paket produk digital",
  },
  payout: {
    src: "/account/account-wallet.png",
    alt: "Ilustrasi saldo dan wallet seller",
  },
  review: {
    src: "/illustrations/invoice-pending.webp",
    alt: "Ilustrasi produk menunggu pemeriksaan",
  },
};

export function SellerIllustration({ variant, compact = false }: { variant: SellerIllustrationVariant; compact?: boolean }) {
  const artwork = ARTWORK[variant];
  return (
    <div className={`seller-illustration seller-illustration-${variant}${compact ? " seller-illustration-compact" : ""}`}>
      <Image src={artwork.src} alt={artwork.alt} width={compact ? 116 : 320} height={compact ? 116 : 240} priority={variant === "login"} />
    </div>
  );
}

