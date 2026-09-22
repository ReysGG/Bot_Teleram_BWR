import Link from "next/link";
import { Search } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { Prisma } from "@/generated/prisma/client";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { prisma } from "@/server/db/prisma";
import { formatRupiah } from "@/server/utils/format";

const statuses = ["AWAITING_PAYMENT", "MATCHED", "CONFIRMED", "EXPIRED", "CANCELLED"] as const;
const targets = ["order", "topup"] as const;
const sorts = ["newest", "oldest", "amount_high", "expiry"] as const;

function parseOption<const T extends readonly string[]>(value: string | undefined, options: T) {
  return options.find((option) => option === value) as T[number] | undefined;
}

function statusPresentation(status: (typeof statuses)[number]) {
  if (status === "AWAITING_PAYMENT") return { label: "Menunggu bayar", tone: "warn" } as const;
  if (status === "MATCHED") return { label: "Event cocok", tone: "warn" } as const;
  if (status === "CONFIRMED") return { label: "Lunas", tone: "good" } as const;
  if (status === "CANCELLED") return { label: "Dibatalkan", tone: "bad" } as const;
  return { label: "Kedaluwarsa", tone: "neutral" } as const;
}

function sortOrder(sort: (typeof sorts)[number] | undefined): Prisma.QrisInvoiceAttemptOrderByWithRelationInput[] {
  if (sort === "oldest") return [{ createdAt: "asc" }, { id: "asc" }];
  if (sort === "amount_high") return [{ amount: "desc" }, { createdAt: "desc" }, { id: "desc" }];
  if (sort === "expiry") return [{ expiresAt: "asc" }, { createdAt: "desc" }, { id: "desc" }];
  return [{ createdAt: "desc" }, { id: "desc" }];
}

export async function QrisPaymentLedgerSection({
  page,
  provider,
  search,
  sort,
  status,
  target,
}: {
  page?: string;
  provider?: string;
  search?: string;
  sort?: string;
  status?: string;
  target?: string;
}) {
  const normalizedSearch = normalizeAdminSearch(search);
  const parsedStatus = status === "all" ? undefined : parseOption(status, statuses);
  const parsedTarget = target === "all" ? undefined : parseOption(target, targets);
  const parsedSort = parseOption(sort, sorts) ?? "newest";
  const normalizedProvider = provider?.trim().slice(0, 64) || "";
  const where: Prisma.QrisInvoiceAttemptWhereInput = {
    ...(parsedStatus ? { status: parsedStatus } : {}),
    ...(parsedTarget === "order" ? { orderId: { not: null } } : {}),
    ...(parsedTarget === "topup" ? { walletTopupId: { not: null } } : {}),
    ...(normalizedProvider ? { providerKeySnapshot: normalizedProvider } : {}),
    ...(normalizedSearch
      ? {
          OR: [
            { merchantNameSnapshot: { contains: normalizedSearch, mode: "insensitive" } },
            { merchantSlugSnapshot: { contains: normalizedSearch, mode: "insensitive" } },
            { providerKeySnapshot: { contains: normalizedSearch, mode: "insensitive" } },
            { matchedEventId: { contains: normalizedSearch, mode: "insensitive" } },
            { matchedEvent: { eventId: { contains: normalizedSearch, mode: "insensitive" } } },
            { order: { invoiceNumber: { contains: normalizedSearch, mode: "insensitive" } } },
            { order: { chatId: { contains: normalizedSearch } } },
            { order: { buyerUsername: { contains: normalizedSearch.replace(/^@/, ""), mode: "insensitive" } } },
            { walletTopup: { invoiceNumber: { contains: normalizedSearch, mode: "insensitive" } } },
            { walletTopup: { chatId: { contains: normalizedSearch } } },
            { walletTopup: { wallet: { buyerUsername: { contains: normalizedSearch.replace(/^@/, ""), mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [total, providerRows] = await Promise.all([
    prisma.qrisInvoiceAttempt.count({ where }),
    prisma.qrisInvoiceAttempt.findMany({
      distinct: ["providerKeySnapshot"],
      orderBy: { providerKeySnapshot: "asc" },
      select: { providerKeySnapshot: true },
    }),
  ]);
  const pagination = adminPagination(total, parseAdminPage(page), 15);
  const attempts = await prisma.qrisInvoiceAttempt.findMany({
    where,
    orderBy: sortOrder(parsedSort),
    skip: pagination.skip,
    take: pagination.take,
    include: {
      matchedEvent: { select: { eventId: true, packageName: true, postedAt: true } },
      order: {
        select: {
          id: true,
          invoiceNumber: true,
          chatId: true,
          buyerUsername: true,
          buyerDisplayName: true,
          items: { orderBy: { createdAt: "asc" }, select: { productNameSnapshot: true } },
        },
      },
      walletTopup: {
        select: {
          id: true,
          invoiceNumber: true,
          chatId: true,
          wallet: { select: { buyerUsername: true, buyerDisplayName: true } },
        },
      },
    },
  });

  return (
    <section className="panel wide-panel usdt-bep20-ledger qris-payment-ledger" id="qris-payment-ledger">
      <div className="panel-heading qris-ledger-heading">
        <div><p className="eyebrow">Merchant snapshot ledger</p><h2>Invoice QRIS</h2></div>
        <form action="/admin/payments/qris#qris-payment-ledger" className="admin-search-form admin-filter-form qris-ledger-filter" method="get">
          <input defaultValue={normalizedSearch} name="qq" placeholder="Cari invoice, user, merchant, atau event..." type="search" />
          <select defaultValue={parsedStatus ?? "all"} name="qs">
            <option value="all">Semua status</option>
            <option value="AWAITING_PAYMENT">Menunggu bayar</option>
            <option value="MATCHED">Event cocok</option>
            <option value="CONFIRMED">Lunas</option>
            <option value="EXPIRED">Kedaluwarsa</option>
            <option value="CANCELLED">Dibatalkan</option>
          </select>
          <select defaultValue={parsedTarget ?? "all"} name="qt">
            <option value="all">Order + top up</option>
            <option value="order">Order produk</option>
            <option value="topup">Top up wallet</option>
          </select>
          <select defaultValue={normalizedProvider || "all"} name="qv">
            <option value="all">Semua provider</option>
            {providerRows.map((row) => <option key={row.providerKeySnapshot} value={row.providerKeySnapshot}>{row.providerKeySnapshot}</option>)}
          </select>
          <select defaultValue={parsedSort} name="qo">
            <option value="newest">Terbaru</option>
            <option value="oldest">Terlama</option>
            <option value="amount_high">Nominal terbesar</option>
            <option value="expiry">Expiry terdekat</option>
          </select>
          <button className="button button-small" type="submit"><Search aria-hidden="true" size={16} /> Terapkan</button>
        </form>
      </div>

      {attempts.length === 0 ? (
        <div className="empty-state"><strong>Belum ada invoice QRIS untuk filter ini.</strong></div>
      ) : (
        <div className="table-wrap">
          <table className="qris-payment-ledger-table">
            <thead><tr><th>Invoice & jenis</th><th>User</th><th>Merchant snapshot</th><th>Provider/package</th><th>Device bridge</th><th>Nominal</th><th>Status</th><th>Event</th><th>Dibuat</th><th>Kedaluwarsa</th><th>Detail</th></tr></thead>
            <tbody>
              {attempts.map((attempt) => {
                const state = statusPresentation(attempt.status);
                const order = attempt.order;
                const topup = attempt.walletTopup;
                const invoice = order?.invoiceNumber ?? topup?.invoiceNumber ?? "-";
                const chatId = order?.chatId ?? topup?.chatId ?? "-";
                const username = order?.buyerUsername ?? topup?.wallet.buyerUsername;
                const displayName = order?.buyerDisplayName ?? topup?.wallet.buyerDisplayName;
                return (
                  <tr key={attempt.id}>
                    <td><strong>{invoice}</strong><small>{order ? "Order produk" : "Top up wallet"}</small>{order ? <small>{order.items.map((item) => item.productNameSnapshot).join(", ")}</small> : null}</td>
                    <td><strong>{username ? `@${username}` : displayName ?? chatId}</strong><small>{chatId}</small></td>
                    <td><strong>{attempt.merchantNameSnapshot}</strong><small>{attempt.merchantSlugSnapshot}</small></td>
                    <td><strong>{attempt.providerKeySnapshot}</strong><small>{attempt.evidenceMode}</small><small>{attempt.allowedPackageNamesSnapshot.join(", ") || "Package belum tersedia"}</small></td>
                    <td><small>{attempt.allowedDeviceIdsSnapshot.join(", ") || "Relay-only"}</small></td>
                    <td><strong>{formatRupiah(attempt.amount)}</strong></td>
                    <td><span className={`status-pill status-${state.tone}`}>{state.label}</span></td>
                    <td><span className="usdt-bep20-hash">{attempt.matchedEvent?.eventId ?? "Belum cocok"}</span><small>{attempt.matchedEvent?.packageName ?? "-"}</small></td>
                    <td>{attempt.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                    <td>{attempt.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                    <td>
                      {order ? <Link className="button button-small" href={`/admin/orders/${encodeURIComponent(order.id)}`} prefetch={false}>Buka order</Link> : null}
                      {topup ? <Link className="button button-small" href={`/admin/wallet?q=${encodeURIComponent(chatId)}#wallet-topups`} prefetch={false}>Buka wallet</Link> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination
        ariaLabel="Pagination invoice QRIS"
        basePath="/admin/payments/qris"
        currentPage={pagination.page}
        fragment="qris-payment-ledger"
        itemLabel="invoice"
        pageParam="qp"
        pageSize={pagination.pageSize}
        query={{
          qo: parsedSort === "newest" ? undefined : parsedSort,
          qq: normalizedSearch || undefined,
          qs: parsedStatus,
          qt: parsedTarget,
          qv: normalizedProvider || undefined,
        }}
        totalItems={pagination.totalItems}
      />
    </section>
  );
}
