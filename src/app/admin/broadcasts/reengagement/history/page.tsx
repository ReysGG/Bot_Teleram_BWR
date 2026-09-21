import Link from "next/link";
import { ArrowLeft, MessageCircleMore } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminSearchForm } from "@/components/admin/admin-search-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { Prisma } from "@/generated/prisma/client";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  if (status === "SENT") return "status-good";
  if (status === "FAILED" || status === "MANUAL_REVIEW") return "status-bad";
  return "status-neutral";
}

function messagePreview(value: string | null) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 140 ? `${normalized.slice(0, 140)}...` : normalized || "Pesan default";
}

export default async function ReengagementHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const search = normalizeAdminSearch(query.q);
  const usernameSearch = search.replace(/^@/, "");
  const matchingSessions = search
    ? await prisma.botSession.findMany({
        where: {
          OR: [
            { chatId: { contains: search } },
            { buyerUsername: { contains: usernameSearch, mode: "insensitive" } },
            { buyerDisplayName: { contains: search, mode: "insensitive" } },
          ],
        },
        select: { chatId: true },
        take: 500,
      })
    : [];
  const sessionChatIds = matchingSessions.map((session) => session.chatId);
  const where: Prisma.TelegramNotificationWhereInput = {
    kind: "REENGAGEMENT",
    ...(search
      ? {
          OR: [
            { chatId: { contains: search } },
            { messageText: { contains: search, mode: "insensitive" } },
            { lastError: { contains: search, mode: "insensitive" } },
            ...(sessionChatIds.length > 0 ? [{ chatId: { in: sessionChatIds } }] : []),
          ],
        }
      : {}),
  };
  const [counts, totalItems] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.telegramNotification.count({ where }),
  ]);
  const pagination = adminPagination(totalItems, parseAdminPage(query.page), 20);
  const notifications = await prisma.telegramNotification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: pagination.skip,
    take: pagination.take,
  });
  const recipients = notifications.length > 0
    ? await prisma.botSession.findMany({
        where: { chatId: { in: [...new Set(notifications.map((item) => item.chatId))] } },
        select: { chatId: true, buyerUsername: true, buyerDisplayName: true, lastInboundAt: true, reengagementSequence: true },
      })
    : [];
  const recipientByChatId = new Map(recipients.map((recipient) => [recipient.chatId, recipient]));

  return (
    <AdminShell
      active="broadcasts"
      counts={counts}
      description="Lacak outbox win-back per penerima tanpa mencampurnya dengan broadcast manual atau notifikasi operasional."
      email={admin.email}
      eyebrow="Reengagement ledger"
      title="Riwayat win-back"
    >
      <section className="panel wide-panel">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><MessageCircleMore aria-hidden="true" /></span>
            <div><p className="eyebrow">Telegram outbox</p><h2>Pesan REENGAGEMENT</h2></div>
          </div>
          <div className="admin-modal-actions">
            <AdminSearchForm action="/admin/broadcasts/reengagement/history" id="reengagement-search" placeholder="Cari @username, nama, chat ID, pesan, error..." value={search} />
            <Link className="button button-ghost" href="/admin/broadcasts/reengagement" prefetch={false}><ArrowLeft aria-hidden="true" size={17} /> Pengaturan</Link>
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="empty-state"><strong>Belum ada riwayat win-back yang cocok.</strong></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Penerima</th><th>Pesan</th><th>Status</th><th>Percobaan</th><th>Dibuat</th><th>Terkirim</th><th>Diagnostik</th></tr></thead>
              <tbody>
                {notifications.map((notification) => {
                  const recipient = recipientByChatId.get(notification.chatId);
                  const recipientName = recipient?.buyerUsername
                    ? `@${recipient.buyerUsername}`
                    : recipient?.buyerDisplayName ?? "User Telegram";
                  return (
                    <tr key={notification.id}>
                      <td><strong>{recipientName}</strong><small>{notification.chatId}</small></td>
                      <td><small>{messagePreview(notification.messageText)}</small></td>
                      <td><span className={`status-pill ${statusTone(notification.status)}`}>{notification.status}</span></td>
                      <td>{notification.attempts}<small>Sequence user: {recipient?.reengagementSequence ?? "-"}</small></td>
                      <td>{notification.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                      <td>{notification.sentAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-"}</td>
                      <td><small>{notification.lastError ?? "-"}</small></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination
          ariaLabel="Pagination riwayat win-back"
          basePath="/admin/broadcasts/reengagement/history"
          currentPage={pagination.page}
          itemLabel="pesan"
          pageSize={pagination.pageSize}
          query={{ q: search || undefined }}
          totalItems={pagination.totalItems}
        />
      </section>
    </AdminShell>
  );
}
