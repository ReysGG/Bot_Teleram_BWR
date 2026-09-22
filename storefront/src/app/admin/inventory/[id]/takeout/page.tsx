import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { StockTakeoutForm } from "@/components/admin/stock-takeout-form";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";
import { prisma } from "@/server/db/prisma";
import { canTakeUnsoldStock } from "@/server/stock/admin-takeout-policy";

export const dynamic = "force-dynamic";
export default async function StockTakeoutPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage();
  const { id } = await params;
  const item = await prisma.digitalStockItem.findUnique({ where: { id }, select: {
    status: true, healthStatus: true, healthHttpStatus: true, originalFilename: true,
    reservedOrderId: true, deliveredOrderId: true, orderItem: { select: { id: true } }, deliveryReceipt: { select: { id: true } },
  } });
  if (!item) notFound();
  const counts = await getAdminInventoryCounts();
  return <AdminShell active="banned" email={admin.email} counts={counts} eyebrow="Pengambilan stok admin" title="Ambil akun dan email">
    <Link href={`/admin/inventory/${id}`} prefetch={false}>Kembali ke detail stok</Link>
    <p>{item.originalFilename} · {item.status} · HTTP {item.healthHttpStatus ?? "—"}</p>
    {canTakeUnsoldStock(item) ? <StockTakeoutForm id={id} /> : <p role="alert">Hanya stok banned yang belum dipesan atau terjual yang dapat diambil.</p>}
  </AdminShell>;
}
