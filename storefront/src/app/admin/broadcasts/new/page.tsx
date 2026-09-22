import Link from "next/link";
import { ArrowLeft, Megaphone } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminPanel, AdminPanelHeading } from "@/components/admin/admin-ui";
import { BroadcastCreateForm } from "@/components/admin/broadcast-create-form";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";

export default async function NewBroadcastPage() {
  const [admin, counts, subscriberCount] = await Promise.all([
    requireAdminPage(),
    getAdminInventoryCounts(),
    prisma.botSession.count({ where: { broadcastEnabled: true } }),
  ]);
  return (
    <AdminShell active="broadcasts" counts={counts} email={admin.email} eyebrow="Admin announcements" title="Buat broadcast" description="Tulis pengumuman Telegram di halaman khusus sebelum dimasukkan ke antrean outbox.">
      <div className="seller-admin-actions"><Link className="button button-quiet" href="/admin/broadcasts"><ArrowLeft aria-hidden="true" size={16} /> Kembali ke broadcast</Link></div>
      <AdminPanel wide>
        <AdminPanelHeading eyebrow="Telegram broadcast" icon={<Megaphone aria-hidden="true" />} title="Pengumuman baru" />
        <BroadcastCreateForm subscriberCount={subscriberCount} />
        <div className="admin-modal-actions"><Link className="button button-ghost" href="/admin/broadcasts">Batal</Link></div>
      </AdminPanel>
    </AdminShell>
  );
}
