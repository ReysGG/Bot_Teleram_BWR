import { ClerkProvider } from "@clerk/nextjs";
import { idID } from "@clerk/localizations";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CartProvider } from "@/components/cart/cart-context";
import { FloatingQuickLinks } from "@/components/site/floating-quick-links";
import { LoginFeedback } from "@/components/auth/login-feedback";
import "../globals.css";
import { LocalPreviewProvider } from "@/components/auth/local-preview-context";
import { isLocalPreview } from "@/lib/runtime-env";

// Deployment flags must be evaluated at runtime, not baked into the Docker build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
  title: "BWR Tele Store",
  description: "Belanja produk digital, bayar dengan mudah, dan unduh dari halaman pesanan.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const hasClerk = !isLocalPreview() && Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const shopContent = <>
    {process.env.STOREFRONT_PREVIEW_READ_ONLY === "true" ? (
      <aside className="preview-banner" aria-label="Status website">
        <strong>Versi uji</strong><span>Katalog bisa dilihat. Pembelian dan pembayaran melalui website belum tersedia.</span>
      </aside>
    ) : null}
    <CartProvider>{children}</CartProvider>
    {hasClerk ? <LoginFeedback /> : null}
    <FloatingQuickLinks />
  </>;
  return (
    <>
      <div className="shop-surface">
        {hasClerk ? <ClerkProvider
          publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
          appearance={{
            variables: {
              colorPrimary: "#1769ff",
              colorForeground: "#0a1736",
              colorMutedForeground: "#64708a",
              colorBackground: "#ffffff",
              colorInput: "#ffffff",
              colorInputForeground: "#0a1736",
              borderRadius: "0.75rem",
              fontFamily: '"Bahnschrift", "Aptos", "Trebuchet MS", sans-serif',
            },
          }}
          localization={{
            ...idID,
            formFieldInputPlaceholder__emailAddress: "Masukkan alamat email",
            formFieldInputPlaceholder__phoneNumber: "Masukkan nomor HP",
            formFieldInputPlaceholder__password: "Masukkan kata sandi",
            formFieldInputPlaceholder__signUpPassword: "Buat kata sandi",
            signUp: {
              ...idID.signUp,
              start: { ...idID.signUp?.start, title: "Buat akunmu", subtitle: "Isi data berikut untuk membuat akun." },
            },
          }}
        >{shopContent}</ClerkProvider> : <LocalPreviewProvider>{shopContent}</LocalPreviewProvider>}
      </div>
    </>
  );
}
