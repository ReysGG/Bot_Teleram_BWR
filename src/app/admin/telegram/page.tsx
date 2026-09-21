import Link from "next/link";
import { Palette } from "lucide-react";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { getTelegramCustomEmojiSettings } from "@/server/telegram/custom-emoji";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

const fields = [
  { key: "chatgpt", label: "ChatGPT / OpenAI / Codex", description: "Brand icon for ChatGPT, GPT, OpenAI, and Codex names." },
  { key: "claude", label: "Claude / Anthropic", description: "Brand icon for Claude and Anthropic names." },
  { key: "catalog", label: "Kategori / katalog", description: "Optional icon used on catalog identity text." },
  { key: "product", label: "Produk / varian", description: "Optional icon used on product and variant rows." },
] as const;

export default async function TelegramSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const [counts, settings] = await Promise.all([
    getAdminInventoryCounts(),
    getTelegramCustomEmojiSettings(),
  ]);
  const valueFor = (key: (typeof fields)[number]["key"]) => {
    if (key === "chatgpt") return settings.chatgptCustomEmojiId ?? settings.emojiIds?.chatgpt ?? "";
    if (key === "claude") return settings.claudeCustomEmojiId ?? settings.emojiIds?.claude ?? "";
    return settings.emojiIds?.[key] ?? "";
  };

  return (
    <AdminShell
      active="telegram"
      counts={counts}
      description="Atur custom emoji premium hanya untuk identitas produk dan kategori. Status stok memakai warna tombol Telegram agar tetap mudah dipindai."
      email={admin.email}
      eyebrow="Telegram UX"
      title="Identitas produk & kategori"
    >
      {query.notice === "emoji-saved" ? <AdminResultModal message="Custom emoji Telegram berhasil disimpan." tone="success" /> : null}
      {query.error ? <AdminResultModal message={query.error === "admin-session" ? "Sesi admin sudah berakhir." : query.error === "admin-origin" ? "Origin admin tidak valid." : "ID custom emoji harus berupa angka atau dikosongkan."} tone="error" /> : null}
      <p><Link className="button button-small button-ghost" href="/admin" prefetch={false}>Kembali ke dashboard</Link></p>
      <section className="panel wide-panel">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><Palette aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">Premium custom emoji</p>
              <h2>Hanya untuk produk dan kategori</h2>
            </div>
          </div>
        </div>
        <p className="muted">
          Telegram tidak mengirim file emoji ke web admin. Masukkan ID numerik yang didapat dari perintah
          <code>/setemoji</code> di chat admin Telegram, atau kosongkan untuk memakai Unicode biasa.
          Tombol status stok memakai warna native Telegram: hijau tersedia, biru preorder, merah tidak tersedia.
        </p>
        <form action="/api/admin/telegram/custom-emoji" className="stack-form" method="post">
          {fields.map((field) => (
            <label key={field.key}>
              {field.label}
              <input defaultValue={valueFor(field.key)} inputMode="numeric" name={field.key} pattern="[0-9]*" placeholder="Kosongkan untuk menonaktifkan" />
              <small>{field.description} ID harus berupa angka, bukan emoji Unicode.</small>
            </label>
          ))}
          <div className="admin-modal-actions">
            <button className="button button-primary" type="submit">Simpan tampilan Telegram</button>
            <Link className="button button-ghost" href="/admin/products" prefetch={false}>Buka produk</Link>
          </div>
        </form>
      </section>
    </AdminShell>
  );
}
