import type { ReactNode } from "react";
import "../globals.css";
import "./admin.css";
export default function AdminLayout({children}:{children:ReactNode}) { return <div className="admin-surface">{children}</div>; }
