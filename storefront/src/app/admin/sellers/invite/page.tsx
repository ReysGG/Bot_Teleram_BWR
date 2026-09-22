import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { SellerInviteForm } from "@/components/admin/sellers/seller-invite-form";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";
export default async function AdminSellerInvitePage() { const [admin, counts] = await Promise.all([requireAdminPage(), getAdminInventoryCounts()]); return <AdminShell active="sellers" counts={counts} email={admin.email} eyebrow="Seller access" title="Undang seller" description="Buat link undangan lokal sekali pakai. Membership tetap inactive sampai alur onboarding seller selesai."><div className="seller-admin-actions"><Link className="button button-quiet" href="/admin/sellers">← Semua seller</Link></div><section className="panel"><SellerInviteForm /></section></AdminShell>; }
