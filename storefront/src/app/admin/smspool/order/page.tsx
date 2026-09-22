import Link from "next/link";
import { ArrowLeft, Smartphone } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminEmptyState, AdminPanel, AdminPanelHeading } from "@/components/admin/admin-ui";
import { SmsPoolOrderForm } from "@/components/admin/smspool-order-form";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";
import {
  getSmsPoolCountries,
  getSmsPoolPools,
  getSmsPoolServices,
  smsPoolConfigured,
  sortSmsPoolFeaturedServices,
} from "@/server/smspool/client";

export const dynamic = "force-dynamic";

export default async function SmsPoolOrderPage() {
  const [admin, counts] = await Promise.all([requireAdminPage(), getAdminInventoryCounts()]);
  const configured = smsPoolConfigured();
  let countries: Awaited<ReturnType<typeof getSmsPoolCountries>> = [];
  let services: Awaited<ReturnType<typeof getSmsPoolServices>> = [];
  let pools: Awaited<ReturnType<typeof getSmsPoolPools>> = [];
  let providerUnavailable = false;

  if (configured) {
    const results = await Promise.allSettled([getSmsPoolCountries(), getSmsPoolServices(), getSmsPoolPools()]);
    providerUnavailable = results.some((result) => result.status === "rejected");
    if (results[0].status === "fulfilled") {
      countries = results[0].value.filter((country) => country.short_name.toUpperCase() === "ID" || country.ID === 9);
    }
    if (results[1].status === "fulfilled") services = sortSmsPoolFeaturedServices(results[1].value);
    if (results[2].status === "fulfilled") pools = results[2].value;
  }

  const canOrder = configured && countries.length > 0 && services.length > 0;
  return (
    <AdminShell active="smspool" counts={counts} email={admin.email} eyebrow="SMS verification" title="Pesan nomor SMS" description="Buat satu order SMSPool dari halaman khusus, lalu pantau OTP dari antrean operasional.">
      <div className="seller-admin-actions"><Link className="button button-quiet" href="/admin/smspool"><ArrowLeft aria-hidden="true" size={16} /> Kembali ke SMSPool</Link></div>
      {!configured ? <p className="alert alert-error">SMSPOOL_API_KEY belum dikonfigurasi di environment local.</p> : null}
      {providerUnavailable ? <p className="alert alert-error">Daftar provider belum dapat dimuat. Refresh halaman setelah provider tersedia.</p> : null}
      <AdminPanel wide>
        <AdminPanelHeading eyebrow="One-time SMS" icon={<Smartphone aria-hidden="true" />} title="Order baru" />
        {canOrder ? <SmsPoolOrderForm countries={countries} pools={pools} services={services} /> : <AdminEmptyState><strong>Form order belum tersedia.</strong><p>Pastikan provider aktif dan daftar negara, layanan, serta pool berhasil dimuat.</p></AdminEmptyState>}
      </AdminPanel>
    </AdminShell>
  );
}
