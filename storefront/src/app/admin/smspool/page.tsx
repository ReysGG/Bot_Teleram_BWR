import Link from "next/link";
import { BadgeDollarSign, Clock3, DollarSign, History, MessageSquareText, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  AdminEmptyState,
  AdminMetricCard,
  AdminMetricGrid,
  AdminPanel,
  AdminPanelHeading,
  AdminStatusPill,
  AdminTable,
} from "@/components/admin/admin-ui";
import { SmsPoolCancelButton } from "@/components/admin/smspool-cancel-button";
import { SmsPoolOrderForm } from "@/components/admin/smspool-order-form";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";
import { prisma } from "@/server/db/prisma";
import {
  getSmsPoolActiveOrders,
  getSmsPoolBalance,
  getSmsPoolCountries,
  getSmsPoolHistory,
  getSmsPoolPricing,
  getSmsPoolPools,
  getSmsPoolServices,
  calculateSmsPoolSellPrice,
  smsPoolConfigured,
  sortSmsPoolFeaturedServices,
  type SmsPoolOrder,
} from "@/server/smspool/client";
import { formatSmsPoolPhoneNumber } from "@/server/smspool/phone";

export const dynamic = "force-dynamic";

const notices: Record<string, string> = {
  ordered: "Nomor berhasil dipesan. Pantau OTP pada tabel order aktif.",
  "customer-cancelled": "Order SMS dibatalkan dan saldo dikembalikan ke wallet user.",
  "provider-cancelled": "Permintaan cancel dikirim dan refund diproses oleh SMSPool.",
};

const errors: Record<string, string> = {
  configuration: "SMSPOOL_API_KEY belum dikonfigurasi di environment production.",
  invalid: "Data order SMSPool tidak valid.",
  provider: "Layanan SMS sedang maintenance atau sementara tidak tersedia. Silakan coba lagi nanti.",
};

function usd(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
    : "$0.00";
}

function idr(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function expiryLabel(order: SmsPoolOrder) {
  if (order.time_left > 0) return `${Math.ceil(order.time_left / 60)} menit`;
  if (order.expiry > 0) {
    return new Date(order.expiry * 1000).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  }
  return "-";
}

function otpLabel(order: SmsPoolOrder) {
  if (order.code && order.code !== "0") return order.code;
  return "Menunggu OTP";
}

export default async function SmsPoolPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const admin = await requireAdminPage();
  const [query, counts, customerOrders] = await Promise.all([
    searchParams,
    getAdminInventoryCounts(),
    prisma.smsPoolCustomerOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const configured = smsPoolConfigured();

  let balance = 0;
  let countries = [] as Awaited<ReturnType<typeof getSmsPoolCountries>>;
  let services = [] as Awaited<ReturnType<typeof getSmsPoolServices>>;
  let pools = [] as Awaited<ReturnType<typeof getSmsPoolPools>>;
  let activeOrders = [] as Awaited<ReturnType<typeof getSmsPoolActiveOrders>>;
  let history = [] as Awaited<ReturnType<typeof getSmsPoolHistory>>;
  let providerUnavailable = false;

  if (configured) {
    const results = await Promise.allSettled([
      getSmsPoolBalance(),
      getSmsPoolCountries(),
      getSmsPoolServices(),
      getSmsPoolPools(),
      getSmsPoolActiveOrders(),
      getSmsPoolHistory(50),
    ] as const);
    providerUnavailable = results.some((result) => result.status === "rejected");
    if (results[0].status === "fulfilled") balance = results[0].value;
    if (results[1].status === "fulfilled") {
      countries = results[1].value.filter(
        (country) => country.short_name.toUpperCase() === "ID" || country.ID === 9,
      );
    }
    if (results[2].status === "fulfilled") {
      services = sortSmsPoolFeaturedServices(results[2].value);
    }
    if (results[3].status === "fulfilled") pools = results[3].value;
    if (results[4].status === "fulfilled") activeOrders = results[4].value;
    if (results[5].status === "fulfilled") history = results[5].value;
  }

  const pendingOtp = activeOrders.filter((order) => !order.code || order.code === "0").length;
  const canOrder = configured && countries.length > 0 && services.length > 0;
  const pricing = getSmsPoolPricing();
  const customerOrderByProviderId = new Map(
    customerOrders
      .filter((order) => order.providerOrderId)
      .map((order) => [order.providerOrderId!, order]),
  );

  return (
    <AdminShell
      active="smspool"
      counts={counts}
      description="Pesan nomor verifikasi, pantau OTP, cek saldo, dan cancel order SMSPool dari server tanpa mengekspos API key."
      email={admin.email}
      eyebrow="SMS verification"
      title="SMSPool"
    >
      {!configured ? <p className="alert alert-error">{errors.configuration}</p> : null}
      {providerUnavailable ? (
        <p className="alert alert-error">Sebagian data SMSPool gagal dimuat. Gunakan Refresh dan periksa konfigurasi/provider.</p>
      ) : null}
      {query.notice ? <p className="alert alert-success">{notices[query.notice] ?? "Operasi SMSPool selesai."}</p> : null}
      {query.error ? <p className="alert alert-error">{errors[query.error] ?? errors.provider}</p> : null}

      <AdminMetricGrid>
        <AdminMetricCard
          accent="accent-green"
          icon={<DollarSign aria-hidden="true" />}
          label="Saldo provider"
          value={usd(balance)}
        />
        <AdminMetricCard
          accent="accent-orange"
          icon={<MessageSquareText aria-hidden="true" />}
          label="Order aktif"
          value={activeOrders.length}
        />
        <AdminMetricCard
          accent="accent-yellow"
          icon={<Clock3 aria-hidden="true" />}
          label="Menunggu OTP"
          value={pendingOtp}
        />
        <AdminMetricCard
          accent="accent-green"
          detail={`+ ${idr(pricing.serviceFeeIdr)} per nomor`}
          icon={<BadgeDollarSign aria-hidden="true" />}
          label="Harga jual"
          value={`${idr(pricing.usdToIdrRate)} / USD`}
        />
      </AdminMetricGrid>

      <AdminPanel wide>
        <AdminPanelHeading eyebrow="Telegram customers" title="Penjualan SMS ke user" />
        {customerOrders.length === 0 ? (
          <AdminEmptyState><strong>Belum ada pembelian SMS dari Telegram.</strong></AdminEmptyState>
        ) : (
          <AdminTable>
              <thead><tr><th>User</th><th>Layanan</th><th>Negara</th><th>Nomor</th><th>OTP</th><th>Harga jual</th><th>Status</th><th>Waktu</th><th>Aksi</th></tr></thead>
              <tbody>
                {customerOrders.map((order) => (
                  <tr key={order.id}>
                    <td><strong>{order.buyerUsername ? `@${order.buyerUsername}` : order.buyerDisplayName || order.chatId}</strong><small>{order.chatId}</small></td>
                    <td>{order.serviceName}</td>
                    <td>{order.countryName}</td>
                    <td>{formatSmsPoolPhoneNumber(order.phoneNumber, order.countryCode) || "-"}</td>
                    <td>{order.otpCode || "-"}</td>
                    <td><strong>{idr(order.sellPrice)}</strong></td>
                    <td><AdminStatusPill>{order.status}</AdminStatusPill></td>
                    <td>{order.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                    <td>
                      {order.status === "ACTIVE" ? (
                        <SmsPoolCancelButton orderId={order.id} refundsWallet />
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
          </AdminTable>
        )}
      </AdminPanel>

      <AdminPanel wide>
        <AdminPanelHeading
          eyebrow="One-time SMS"
          title="Pesan nomor baru"
          trailing={(
            <Link className="button button-ghost" href="/admin/smspool" prefetch={false}>
              <RefreshCw aria-hidden="true" size={17} />
              Refresh
            </Link>
          )}
        />
        {canOrder ? (
          <SmsPoolOrderForm countries={countries} pools={pools} services={services} />
        ) : (
          <AdminEmptyState>
            <strong>Form order belum tersedia.</strong>
            <p>Konfigurasikan API key atau tunggu daftar negara dan layanan berhasil dimuat.</p>
          </AdminEmptyState>
        )}
      </AdminPanel>

      <AdminPanel wide>
        <AdminPanelHeading eyebrow="Live provider state" title="Order aktif & OTP" />
        {activeOrders.length === 0 ? (
          <AdminEmptyState><strong>Tidak ada order SMS aktif.</strong></AdminEmptyState>
        ) : (
          <AdminTable>
              <thead><tr><th>Nomor</th><th>Layanan</th><th>OTP</th><th>Biaya provider</th><th>Harga jual</th><th>Sisa waktu</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {activeOrders.map((order) => {
                  const customerOrder = customerOrderByProviderId.get(order.order_code);
                  return (
                  <tr key={order.order_code}>
                    <td><strong>{order.phonenumber}</strong><small>{order.short_name} · {order.order_code}</small></td>
                    <td>{order.service || "-"}</td>
                    <td><strong>{otpLabel(order)}</strong><small>{order.full_code || ""}</small></td>
                    <td>{usd(order.cost)}</td>
                    <td><strong>{idr(calculateSmsPoolSellPrice(order.cost))}</strong></td>
                    <td>{expiryLabel(order)}</td>
                    <td><AdminStatusPill>{order.status}</AdminStatusPill></td>
                    <td>
                      <SmsPoolCancelButton
                        orderId={customerOrder?.id ?? order.order_code}
                        refundsWallet={Boolean(customerOrder)}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
          </AdminTable>
        )}
      </AdminPanel>

      <AdminPanel wide>
        <AdminPanelHeading
          eyebrow="Provider history"
          title="Riwayat SMSPool"
          trailing={<History aria-hidden="true" size={27} />}
        />
        {history.length === 0 ? (
          <AdminEmptyState><strong>Riwayat belum tersedia.</strong></AdminEmptyState>
        ) : (
          <AdminTable>
              <thead><tr><th>Order</th><th>Nomor</th><th>Layanan</th><th>OTP</th><th>Status</th><th>Biaya provider</th><th>Harga jual</th><th>Waktu</th></tr></thead>
              <tbody>
                {history.map((order) => (
                  <tr key={`${order.order_code}-${order.timestamp}`}>
                    <td>{order.order_code}</td>
                    <td>{order.phonenumber}</td>
                    <td>{order.service || "-"}</td>
                    <td>{order.code && order.code !== "0" ? order.code : "-"}</td>
                    <td><AdminStatusPill>{order.status}</AdminStatusPill></td>
                    <td>{usd(order.cost)}</td>
                    <td><strong>{idr(calculateSmsPoolSellPrice(order.cost))}</strong></td>
                    <td>{order.timestamp || "-"}</td>
                  </tr>
                ))}
              </tbody>
          </AdminTable>
        )}
      </AdminPanel>
    </AdminShell>
  );
}
