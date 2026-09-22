import type { ReactNode } from "react";
import "./globals.css";
export default function RootLayout({ children }: { children: ReactNode }) {
 return <html lang="id"><body style={{margin:0}}>{children}</body></html>;
}
