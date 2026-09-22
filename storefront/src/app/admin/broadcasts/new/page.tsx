import Link from "next/link";
import { ArrowLeft, Megaphone } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminPanel, AdminPanelHeading } from "@/components/admin/admin-ui";
import { TelegramRichTextEditor } from "@/components/admin/telegram-rich-text-editor";
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
        <form action="/api/admin/broadcasts" className="stack-form" method="post">
          <label>Judul<input maxLength={120} minLength={3} name="title" placeholder="Contoh: Maintenance malam ini" required /></label>
          <TelegramRichTextEditor entitiesName="messageEntities" label="Isi pengumuman" maxLength={3000} minLength={3} name="message" placeholder="Tulis informasi yang akan diterima pengguna Telegram." required />
          <p className="fine-print">Pengumuman akan masuk antrean untuk {subscriberCount} pengguna yang masih mengaktifkan notifikasi, lalu dikirim oleh notification worker.</p>
          <div className="admin-modal-actions"><button className="button button-primary" type="submit"><Megaphone aria-hidden="true" size={18} /> Antrekan broadcast</button><Link className="button button-ghost" href="/admin/broadcasts">Batal</Link></div>
        </form>
      </AdminPanel>
    </AdminShell>
  );
}
