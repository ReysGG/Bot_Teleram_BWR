import Link from "next/link";
import { Search } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { prisma } from "@/server/db/prisma";
import { formatRupiah } from "@/server/utils/format";
import { AdminOrderPaymentAction } from "@/components/admin/admin-order-payment-action";

const statuses = ["AWAITING_TRANSFER", "CONFIRMED", "EXPIRED", "CANCELLED"] as const;

function parseStatus(value: string | undefined) {
  return statuses.find((status) => status === value);
}

function presentation(status: (typeof statuses)[number]) {
  if (status === "AWAITING_TRANSFER") return { label: "Menunggu transfer", tone: "warn" } as const;
  if (status === "CONFIRMED") return { label: "Lunas", tone: "good" } as const;
  if (status === "CANCELLED") return { label: "Dibatalkan", tone: "bad" } as const;
  return { label: "Kedaluwarsa", tone: "neutral" } as const;
}

export async function JagoTransferLedgerSection({
  page,
  search,
  status,
}: {
  page?: string;
  search?: string;
  status?: string;
}) {
  const normalizedSearch = normalizeAdminSearch(search);
  const parsedStatus = status === "all" ? undefined : parseStatus(status);
  const where = {
    ...(parsedStatus ? { status: parsedStatus } : {}),
    ...(normalizedSearch
      ? {
          OR: [
            { order: { invoiceNumber: { contains: normalizedSearch, mode: "insensitive" as const } } },
            { order: { chatId: { contains: normalizedSearch, mode: "insensitive" as const } } },
            { order: { buyerUsername: { contains: normalizedSearch, mode: "insensitive" as const } } },
            { recipientAccountNumberSnapshot: { contains: normalizedSearch } },
            { matchedEventId: { contains: normalizedSearch, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const total = await prisma.jagoTransferAttempt.count({ where });
  const pagination = adminPagination(total, parseAdminPage(page), 15);
  const attempts = await prisma.jagoTransferAttempt.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: pagination.skip,
    take: pagination.take,
    include: {
      order: {
        include: {
          payment: true,
          items: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  const returnQuery = new URLSearchParams();
  if (page) returnQuery.set("jp", page);
  if (normalizedSearch) returnQuery.set("jq", normalizedSearch);
  if (parsedStatus) returnQuery.set("js", parsedStatus);
  const returnTo = `/admin/payments/jago${returnQuery.size ? `?${returnQuery}` : ""}#jago-transfer-ledger`;
  const now = new Date();

  return (
    <section className="panel wide-panel usdt-bep20-ledger" id="jago-transfer-ledger">
      <div className="panel-heading">
        <div><p className="eyebrow">Bank notification ledger</p><h2>Transaksi Bank Jago</h2></div>
        <form action="/admin/payments/jago#jago-transfer-ledger" className="admin-search-form admin-filter-form" method="get">
          <input defaultValue={normalizedSearch} name="jq" placeholder="Cari invoice, username, chat ID, atau event..." type="search" />
          <select defaultValue={parsedStatus ?? "all"} name="js">
            <option value="all">Semua status</option>
            <option value="AWAITING_TRANSFER">Menunggu transfer</option>
            <option value="CONFIRMED">Lunas</option>
            <option value="EXPIRED">Kedaluwarsa</option>
            <option value="CANCELLED">Dibatalkan</option>
          </select>
          <button className="button button-small" type="submit"><Search aria-hidden="true" size={16} /> Terapkan</button>
        </form>
      </div>
      {attempts.length === 0 ? (
        <div className="empty-state"><strong>Belum ada transaksi Bank Jago.</strong></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Invoice & user</th><th>Nominal</th><th>Rekening snapshot</th><th>Status</th><th>Event</th><th>Waktu cocok</th><th>Aksi</th><th>Detail</th></tr></thead>
            <tbody>
              {attempts.map((attempt) => {
                const state = presentation(attempt.status);
                return (
                  <tr key={attempt.id}>
                    <td>
                      <Link href={`/admin/orders/${attempt.orderId}`} prefetch={false}><strong>{attempt.order.invoiceNumber}</strong></Link>
                      <small>{attempt.order.buyerUsername ? `@${attempt.order.buyerUsername}` : attempt.order.buyerDisplayName ?? attempt.order.chatId}</small>
                      <small>{attempt.order.chatId}</small>
                    </td>
                    <td><strong>{formatRupiah(attempt.order.payment?.billedAmount ?? attempt.order.grandTotal)}</strong><small>{attempt.order.items.map((item) => item.productNameSnapshot).join(", ")}</small></td>
                    <td>{attempt.recipientAccountNumberSnapshot}</td>
                    <td><span className={`status-pill status-${state.tone}`}>{state.label}</span></td>
                    <td><span className="usdt-bep20-hash">{attempt.matchedEventId ?? "Belum cocok"}</span></td>
                    <td>{attempt.matchedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-"}</td>
                    <td>
                      <AdminOrderPaymentAction
                        now={now}
                        order={attempt.order}
                        returnTo={returnTo}
                      />
                    </td>
                    <td><Link className="button button-small" href={`/admin/orders/${attempt.orderId}`} prefetch={false}>Buka order</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <AdminPagination
        ariaLabel="Pagination transaksi Bank Jago"
        basePath="/admin/payments/jago"
        currentPage={pagination.page}
        fragment="jago-transfer-ledger"
        itemLabel="transaksi"
        pageParam="jp"
        pageSize={pagination.pageSize}
        query={{ jq: normalizedSearch || undefined, js: parsedStatus }}
        totalItems={pagination.totalItems}
      />
    </section>
  );
}
