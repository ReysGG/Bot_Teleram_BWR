import {
  MAX_POST_DELIVERY_INSTRUCTIONS_LENGTH,
  MAX_PRODUCT_REDEEM_URL_LENGTH,
} from "@/server/products/post-delivery";
import { TelegramRichTextEditor } from "@/components/admin/telegram-rich-text-editor";

export function ProductPostDeliveryFields({
  instructions,
  entities,
  redeemUrl,
}: {
  instructions?: string | null;
  entities?: unknown;
  redeemUrl?: string | null;
}) {
  return (
    <fieldset className="product-delivery-fields stack-form">
      <legend>Panduan setelah produk terkirim</legend>
      <p className="fine-print">
        Opsional. Bot mengirim pesan ini satu kali setelah semua file produk dan
        lampiran selesai dikirim. Cocok untuk link redeem CDK, cara aktivasi,
        atau langkah penggunaan. Website menampilkan panduan ini kepada pemilik pesanan setelah pembayaran terverifikasi.
      </p>
      <TelegramRichTextEditor
        audience="private"
        entitiesName="postDeliveryEntities"
        helpText="Telegram: dikirim setelah seluruh file selesai diterima. Website: tampil privat di detail pesanan setelah pembayaran terverifikasi."
        initialEntities={entities}
        initialText={instructions}
        label="Instruksi penggunaan"
        maxLength={MAX_POST_DELIVERY_INSTRUCTIONS_LENGTH}
        name="postDeliveryInstructions"
        placeholder="Contoh: Buka halaman redeem, masuk dengan akun Anda, lalu masukkan kode dari file yang sudah dikirim."
        previewMode="side"
      />
      <label>
        URL tempat redeem
        <input
          defaultValue={redeemUrl ?? ""}
          inputMode="url"
          maxLength={MAX_PRODUCT_REDEEM_URL_LENGTH}
          name="redeemUrl"
          placeholder="https://contoh.com/redeem"
          type="url"
        />
        <small>Hanya URL HTTPS. Digunakan sebagai tombol claim/redeem pada pesanan website dan pesan pengiriman Telegram.</small>
      </label>
    </fieldset>
  );
}
