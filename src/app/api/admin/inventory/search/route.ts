import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { searchInventoryContent } from "@/server/admin/inventory-content-search";

export const runtime = "nodejs";
const schema = z.object({
  query: z.string().trim().min(4).max(256),
  productId: z.string().max(191).optional(),
  after: z.string().max(191).optional(),
});
const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
export async function POST(request: NextRequest) {
  let admin;
  try { admin = requireAdminRequest(request); }
  catch { return NextResponse.json({ error: "Sesi admin berakhir. Masuk kembali." }, { status: 401, headers }); }
  try { assertAdminOrigin(request); }
  catch { return NextResponse.json({ error: "Asal permintaan tidak valid." }, { status: 403, headers }); }
  if (!consumeRateLimit(`inventory-content:${admin.email}`, 120, 60_000)) {
    return NextResponse.json({ error: "Terlalu banyak pencarian. Tunggu satu menit lalu lanjutkan." }, { status: 429, headers });
  }
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Isi pencarian diperlukan." }, { status: 400, headers });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) { await reader.cancel(); return NextResponse.json({ error: "Pencarian terlalu panjang." }, { status: 413, headers }); }
      chunks.push(chunk.value);
    }
    const input = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!input.success) return NextResponse.json({ error: "Masukkan 4–256 karakter untuk dicari." }, { status: 400, headers });
    const result = await searchInventoryContent(prisma, input.data);
    return NextResponse.json(result, { headers });
  } catch {
    return NextResponse.json({ error: "Pencarian belum selesai. Coba lagi." }, { status: 500, headers });
  }
}
