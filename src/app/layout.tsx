import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay Stockroom",
  description: "Independent Telegram digital product store",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
