"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Fingerprint,
  ImageUp,
  LockKeyhole,
  Save,
  ScanLine,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  X,
} from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";
import {
  isShopeePartnerQrisPayload,
  preserveQrisPayload,
} from "@/components/admin/qris-payload-preservation";
import type { AdminBridgeDeviceOption } from "@/server/payment/bridge-device-options";
import { qrisMerchantActivationReadiness } from "@/server/payment/qris-merchant-activation-policy";
import type { ShopeePartnerSessionOption } from "@/server/payment/shopee-partner-session";

type ProviderOption = {
  key: string;
  displayName: string;
  ready: boolean;
  usesDanaRelay: boolean;
  trustedPackageNames: readonly string[];
  notReadyReason: string | null;
};

type MerchantFormValue = {
  slug: string;
  name: string;
  providerKey: string;
  enabled: boolean;
  trustedDeviceId: string | null;
  payloadFingerprint: string | null;
  shopeeAccountFingerprint: string | null;
};

type ShopeeSessionOption = Omit<ShopeePartnerSessionOption, "lastValidatedAt"> & {
  lastValidatedAt: string | null;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_QRIS_IMAGE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_QRIS_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type DecodeStatus =
  | { state: "idle"; message: string }
  | { state: "processing"; message: string }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

function shortFingerprint(value: string | null) {
  if (!value) return "Belum tersedia";
  return `${value.slice(0, 12)}...${value.slice(-12)}`;
}

function shortDeviceId(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 6)}...${value.slice(-8)}`;
}

function deviceLastSeenLabel(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
}

function merchantDefaults(providerKey: string) {
  return providerKey === "SHOPEE_PARTNER"
    ? { name: "ShopeePay QRIS Utama", slug: "shopeepay-qris-utama" }
    : { name: "DANA QRIS Utama", slug: "dana-qris-utama" };
}

export function QrisMerchantForm({
  action,
  bridgeDevices,
  defaultProviderKey,
  mode,
  providers,
  shopeeSessions = [],
  initialShopeeSessionId,
  initialValue,
}: {
  action: string;
  bridgeDevices: readonly AdminBridgeDeviceOption[];
  defaultProviderKey?: string;
  mode: "create" | "edit";
  providers: readonly ProviderOption[];
  shopeeSessions?: readonly ShopeeSessionOption[];
  initialShopeeSessionId?: string;
  initialValue?: MerchantFormValue;
}) {
  const initialProviderKey = initialValue?.providerKey ?? defaultProviderKey ?? providers[0]?.key ?? "";
  const initialDefaults = merchantDefaults(initialProviderKey);
  const defaultShopeeBridgeDevice = bridgeDevices.find(
    (device) => device.supportsShopeePartner === true,
  ) ?? bridgeDevices[0];
  const [slug, setSlug] = useState(initialValue?.slug ?? (mode === "create" ? initialDefaults.slug : ""));
  const [name, setName] = useState(initialValue?.name ?? (mode === "create" ? initialDefaults.name : ""));
  const [providerKey, setProviderKey] = useState(initialProviderKey);
  const [basePayload, setBasePayload] = useState("");
  const [enabled, setEnabled] = useState(initialValue?.enabled ?? mode === "create");
  const [activateAfterSave, setActivateAfterSave] = useState(mode === "create");
  const [trustedDeviceId, setTrustedDeviceId] = useState(
    initialValue?.trustedDeviceId ??
      (mode === "create" && initialProviderKey === "SHOPEE_PARTNER"
        ? defaultShopeeBridgeDevice?.deviceId ?? ""
        : ""),
  );
  const initialBindingSelection = initialValue?.shopeeAccountFingerprint
    ? (initialShopeeSessionId ?? "__keep")
    : "";
  const [shopeeSessionId, setShopeeSessionId] = useState(initialBindingSelection);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const [selectedImageName, setSelectedImageName] = useState("");
  const [decodeStatus, setDecodeStatus] = useState<DecodeStatus>({
    state: "idle",
    message: "PNG, JPEG, atau WebP maksimal 5 MB.",
  });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previousProviderKeyRef = useRef<string | null>(null);
  const titleId = useId();
  const provider = useMemo(
    () => providers.find((entry) => entry.key === providerKey) ?? null,
    [providerKey, providers],
  );
  const normalizedSlug = slug.trim().toLowerCase();
  const normalizedName = name.trim();
  const normalizedPayload = preserveQrisPayload(basePayload);
  const normalizedDeviceId = trustedDeviceId.trim();
  const selectedBridgeDevice = bridgeDevices.find((device) => device.deviceId === normalizedDeviceId) ?? null;
  const knownDeviceSelection = selectedBridgeDevice
    ? selectedBridgeDevice.deviceId
    : normalizedDeviceId
      ? "__manual"
      : "";
  const selectedDeviceOperational = Boolean(
    selectedBridgeDevice?.isFresh && selectedBridgeDevice.listenerConnected !== false,
  );
  const selectedShopeeBridgeOutdated = providerKey === "SHOPEE_PARTNER" &&
    selectedBridgeDevice?.supportsShopeePartner === false;
  const deviceIdValid = normalizedDeviceId.length === 0 || normalizedDeviceId.length >= 8;
  const activationReadiness = provider
    ? qrisMerchantActivationReadiness(provider, normalizedDeviceId || null, bridgeDevices)
    : null;
  const activationReady = activationReadiness?.canActivate ?? false;
  const selectedShopeeSession = shopeeSessions.find((session) => session.id === shopeeSessionId) ?? null;
  const hasUnresolvedShopeeBinding = shopeeSessionId === "__keep";
  const decodingImage = decodeStatus.state === "processing";
  const formValid = SLUG_PATTERN.test(normalizedSlug) &&
    normalizedSlug.length <= 64 &&
    normalizedName.length >= 2 &&
    normalizedName.length <= 100 &&
    deviceIdValid &&
    Boolean(provider) &&
    (!activateAfterSave || activationReady) &&
    (mode === "edit" || normalizedPayload.length >= 20);

  function selectProvider(nextProviderKey: string) {
    if (mode === "create") {
      const currentDefaults = merchantDefaults(providerKey);
      const nextDefaults = merchantDefaults(nextProviderKey);
      setName((current) => !current.trim() || current === currentDefaults.name ? nextDefaults.name : current);
      setSlug((current) => !current.trim() || current === currentDefaults.slug ? nextDefaults.slug : current);
    }
    setProviderKey(nextProviderKey);
    if (nextProviderKey !== "SHOPEE_PARTNER") {
      setShopeeSessionId("");
    }
  }

  async function decodeQrisImage(file: File) {
    setDraggingImage(false);
    setSelectedImageName(file.name);

    const acceptedExtension = /\.(?:png|jpe?g|webp)$/i.test(file.name);
    if ((!file.type && !acceptedExtension) || (file.type && !ACCEPTED_QRIS_IMAGE_TYPES.has(file.type))) {
      setDecodeStatus({
        state: "error",
        message: "Format gambar tidak didukung. Gunakan PNG, JPEG, atau WebP.",
      });
      return;
    }

    if (file.size > MAX_QRIS_IMAGE_SIZE) {
      setDecodeStatus({
        state: "error",
        message: "Ukuran gambar melebihi 5 MB. Kompres gambar lalu coba kembali.",
      });
      return;
    }

    setDecodeStatus({
      state: "processing",
      message: "Sedang mencari dan membaca QRIS dari gambar...",
    });

    const imageUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
        image.src = imageUrl;
      });

      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      let decodedText: string;
      try {
        decodedText = (await reader.decodeFromImageElement(image)).getText();
      } catch {
        const size = Math.min(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context || size <= 0) throw new Error("QR_CENTER_CROP_FAILED");
        context.drawImage(
          image,
          Math.floor((image.naturalWidth - size) / 2),
          Math.floor((image.naturalHeight - size) / 2),
          size,
          size,
          0,
          0,
          size,
          size,
        );
        decodedText = reader.decodeFromCanvas(canvas).getText();
      }
      const decodedPayload = preserveQrisPayload(decodedText);

      if (decodedPayload.length < 20) {
        throw new Error("QR_PAYLOAD_TOO_SHORT");
      }

      setBasePayload(decodedPayload);
      if (isShopeePartnerQrisPayload(decodedPayload)) {
        selectProvider("SHOPEE_PARTNER");
      }
      setDecodeStatus({
        state: "success",
        message: "QRIS berhasil dibaca dan dimasukkan otomatis. Payload akan divalidasi lagi saat disimpan.",
      });
    } catch {
      setDecodeStatus({
        state: "error",
        message: "QRIS tidak terbaca. Gunakan gambar asli yang tajam, potong area QR, atau tempel payload secara manual.",
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  function selectQrisImage(fileList: FileList | null) {
    const file = fileList?.item(0);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (file) void decodeQrisImage(file);
  }

  useEffect(() => {
    const providerChanged = previousProviderKeyRef.current !== providerKey;
    previousProviderKeyRef.current = providerKey;
    if (
      providerChanged &&
      providerKey === "SHOPEE_PARTNER" &&
      !trustedDeviceId.trim() &&
      defaultShopeeBridgeDevice
    ) {
      setTrustedDeviceId(defaultShopeeBridgeDevice.deviceId);
    }
  }, [defaultShopeeBridgeDevice, providerKey, trustedDeviceId]);

  useEffect(() => {
    if (!confirmOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setConfirmOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirmOpen, submitting]);

  return (
    <>
      <section className="panel wide-panel qris-merchant-editor">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><LockKeyhole aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">Static QRIS vault</p>
              <h2>{mode === "create" ? "Tambah merchant QRIS" : "Edit merchant QRIS"}</h2>
            </div>
          </div>
          <span className={`status-pill ${enabled && activationReady ? "status-good" : enabled ? "status-warn" : "status-neutral"}`}>
            {enabled && activationReady ? "Siap dipilih" : enabled ? "Konfigurasi belum lengkap" : "Dinonaktifkan"}
          </span>
        </div>

        <p className="payment-method-intro">
          Unggah gambar QRIS statis dan sistem akan mendekodenya otomatis. Payload lalu divalidasi, dienkripsi, dan diubah menjadi QRIS dinamis sesuai nominal invoice.
        </p>

        <div className="qris-merchant-form-grid">
          <label>
            Nama merchant
            <input
              autoComplete="off"
              maxLength={100}
              placeholder="Contoh: QRIS toko utama"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <small>Nama internal yang muncul di admin dan snapshot invoice.</small>
          </label>

          <label>
            Slug stabil
            <input
              autoCapitalize="none"
              autoComplete="off"
              maxLength={64}
              placeholder="qris-toko-utama"
              spellCheck={false}
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"))}
            />
            <small>Huruf kecil, angka, dan tanda hubung. Dipakai untuk audit, bukan ditampilkan ke pembeli.</small>
          </label>

          <label>
            Provider notifikasi
            <select value={providerKey} onChange={(event) => selectProvider(event.target.value)}>
              {providers.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.displayName}{entry.ready ? "" : " - belum siap"}
                </option>
              ))}
            </select>
            <small>Provider menentukan package Android yang boleh mengonfirmasi invoice merchant ini.</small>
          </label>

          <label>
            Perangkat bridge terdeteksi
            <select
              value={knownDeviceSelection}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "__manual") {
                  if (selectedBridgeDevice) setTrustedDeviceId("");
                  return;
                }
                setTrustedDeviceId(value);
              }}
            >
              <option value="">
                {provider?.usesDanaRelay ? "Tanpa perangkat (relay-only)" : "Pilih perangkat Android"}
              </option>
              {bridgeDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {shortDeviceId(device.deviceId)} - {device.isFresh ? "online" : "heartbeat lama"} - v{device.appVersion ?? "?"}
                </option>
              ))}
              <option value="__manual">Masukkan Device ID lain secara manual</option>
            </select>
            <small>Perangkat yang terbaru otomatis dipilih saat provider Shopee terdeteksi. HP yang sama dapat dipakai oleh merchant DANA dan Shopee.</small>
          </label>

          <label>
            Device ID aktif
            <input
              autoCapitalize="none"
              autoComplete="off"
              maxLength={200}
              placeholder={provider?.usesDanaRelay ? "Opsional untuk DANA relay" : "Wajib sebelum provider non-relay diaktifkan"}
              spellCheck={false}
              value={trustedDeviceId}
              onChange={(event) => setTrustedDeviceId(event.target.value)}
            />
            <small>{provider?.usesDanaRelay ? "Kosong berarti invoice hanya dapat dikonfirmasi melalui relay; event Android langsung akan ditolak." : "Pilih perangkat heartbeat di atas atau masukkan ID lain secara manual."}</small>
          </label>

          {providerKey === "SHOPEE_PARTNER" ? (
            <label>
              Binding akun Shopee untuk web-session
              <select
                value={shopeeSessionId}
                onChange={(event) => setShopeeSessionId(event.target.value)}
              >
                <option value="">Tidak diikat (Android notification saja)</option>
                {hasUnresolvedShopeeBinding ? (
                  <option value="__keep">Pertahankan binding akun tersimpan (session aktif tidak ditemukan)</option>
                ) : null}
                {shopeeSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} - merchant {session.merchantId} / store {session.storeId}
                  </option>
                ))}
              </select>
              <small>
                Pilih session aktif yang sudah tervalidasi dan sesuai dengan QRIS ini. Yang dikirim ke server hanya ID session; fingerprint akun dibaca ulang dari database.
              </small>
              {initialValue?.shopeeAccountFingerprint ? (
                <small>Binding tersimpan: <code>{shortFingerprint(initialValue.shopeeAccountFingerprint)}</code></small>
              ) : null}
              {selectedShopeeSession ? (
                <small>Session dipilih: <code>{shortFingerprint(selectedShopeeSession.merchantAccountFingerprint)}</code></small>
              ) : null}
            </label>
          ) : null}

          {selectedBridgeDevice ? (
            <div className={`qris-device-status ${selectedDeviceOperational ? "is-good" : "is-warning"}`} role="status">
              <Smartphone aria-hidden="true" size={20} />
              <div>
                <strong>{selectedBridgeDevice.isFresh ? "Heartbeat aktif" : "Heartbeat sudah lama"}</strong>
                <span>Terakhir terlihat {deviceLastSeenLabel(selectedBridgeDevice.lastSeenAt)}</span>
                <span>Listener {selectedBridgeDevice.listenerConnected === true ? "terhubung" : selectedBridgeDevice.listenerConnected === false ? "terputus" : "belum dilaporkan"} - Bridge v{selectedBridgeDevice.appVersion ?? "belum dilaporkan"}</span>
              </div>
            </div>
          ) : null}

          <label className="checkbox-row qris-merchant-enabled">
            <input
              checked={enabled}
              type="checkbox"
              onChange={(event) => {
                setEnabled(event.target.checked);
                if (!event.target.checked) setActivateAfterSave(false);
              }}
            />
            <span>
              <strong>Merchant dapat dipilih sebagai QRIS aktif</strong>
              <small>Aktif di sini belum mengubah merchant checkout. Pilih secara terpisah setelah konfigurasi siap.</small>
            </span>
          </label>

          {mode === "create" ? (
            <label className="checkbox-row qris-merchant-enabled qris-merchant-activate-after-save">
              <input
                checked={activateAfterSave}
                type="checkbox"
                onChange={(event) => {
                  setActivateAfterSave(event.target.checked);
                  if (event.target.checked) setEnabled(true);
                }}
              />
              <span>
                <strong>Langsung jadikan QRIS checkout aktif</strong>
                <small>Setelah lolos validasi, invoice baru langsung memakai merchant ini. QRIS lama tetap tersimpan pada snapshot invoice yang sudah dibuat.</small>
              </span>
            </label>
          ) : null}
        </div>

        <section aria-labelledby="qris-image-upload-title" className="qris-image-decoder">
          <div className="qris-image-decoder-heading">
            <span className="qris-image-decoder-icon"><ScanLine aria-hidden="true" /></span>
            <div>
              <strong id="qris-image-upload-title">Ambil payload dari gambar QRIS</strong>
              <small>Upload satu gambar; hasil decode langsung masuk ke kolom payload di bawah.</small>
            </div>
          </div>

          <input
            ref={imageInputRef}
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            aria-label="Pilih gambar QRIS"
            className="qris-image-file-input"
            disabled={decodingImage || submitting}
            type="file"
            onChange={(event) => selectQrisImage(event.target.files)}
          />

          <button
            className={`qris-image-dropzone${draggingImage ? " is-dragging" : ""}`}
            disabled={decodingImage || submitting}
            type="button"
            onClick={() => imageInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!decodingImage && !submitting) setDraggingImage(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingImage(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!decodingImage && !submitting) selectQrisImage(event.dataTransfer.files);
            }}
          >
            <ImageUp aria-hidden="true" size={30} />
            <strong>{decodingImage ? "Membaca QRIS..." : "Tarik gambar QRIS ke sini"}</strong>
            <span>atau klik untuk memilih gambar dari perangkat</span>
          </button>

          <div
            aria-live="polite"
            className={`qris-image-decode-status is-${decodeStatus.state}`}
            role={decodeStatus.state === "error" ? "alert" : "status"}
          >
            {decodeStatus.state === "success" ? <CheckCircle2 aria-hidden="true" size={19} /> : null}
            {decodeStatus.state === "error" ? <TriangleAlert aria-hidden="true" size={19} /> : null}
            {decodeStatus.state === "processing" ? <span aria-hidden="true" className="qris-decode-spinner" /> : null}
            <span>
              {selectedImageName ? <strong>{selectedImageName}</strong> : null}
              {decodeStatus.message}
            </span>
          </div>
        </section>

        <label className="qris-payload-input">
          {mode === "create" ? "Payload QRIS statis" : "Ganti payload QRIS statis (opsional)"}
          <textarea
            autoCapitalize="none"
            autoComplete="off"
            maxLength={4096}
            placeholder={mode === "create"
              ? "Terisi otomatis setelah gambar berhasil dibaca, atau tempel payload manual"
              : "Upload QRIS baru, tempel payload manual, atau kosongkan agar payload tersimpan tidak berubah"}
            rows={7}
            spellCheck={false}
            value={basePayload}
            onChange={(event) => setBasePayload(event.target.value)}
          />
          <small>Kolom manual tetap tersedia sebagai fallback. Payload mentah hanya dikirim saat penyimpanan dan tidak pernah ditampilkan kembali oleh admin.</small>
        </label>

        {initialValue?.payloadFingerprint ? (
          <div className="qris-fingerprint-box">
            <Fingerprint aria-hidden="true" size={20} />
            <span><strong>Fingerprint payload tersimpan</strong><code title={initialValue.payloadFingerprint}>{shortFingerprint(initialValue.payloadFingerprint)}</code></span>
          </div>
        ) : null}

        {selectedShopeeBridgeOutdated ? (
          <p className="alert alert-error qris-merchant-warning">
            <TriangleAlert aria-hidden="true" size={18} />
            <span><strong>Bridge Android perangkat ini belum mendukung Shopee Partner.</strong> Perbarui aplikasi bridge ke versi 1.5.7 atau lebih baru sebelum menerima pembayaran.</span>
          </p>
        ) : providerKey === "SHOPEE_PARTNER" && selectedBridgeDevice?.supportsShopeePartner === null ? (
          <p className="alert alert-error qris-merchant-warning">
            <TriangleAlert aria-hidden="true" size={18} />
            <span><strong>Versi bridge belum dilaporkan.</strong> Pastikan aplikasi bridge versi 1.5.7 atau lebih baru, lalu tunggu heartbeat berikutnya.</span>
          </p>
        ) : providerKey === "SHOPEE_PARTNER" && normalizedDeviceId && !selectedBridgeDevice ? (
          <p className="alert alert-error qris-merchant-warning">
            <TriangleAlert aria-hidden="true" size={18} />
            <span><strong>Device ID belum dikenali dari heartbeat.</strong> Merchant dapat disimpan sebagai draft, tetapi belum dapat dijadikan QRIS checkout aktif.</span>
          </p>
        ) : null}

        {provider && (!provider.ready || (!provider.usesDanaRelay && !normalizedDeviceId)) ? (
          <p className="alert alert-error qris-merchant-warning">
            <TriangleAlert aria-hidden="true" size={18} />
            <span><strong>{provider.displayName} belum siap diaktifkan.</strong> {provider.notReadyReason ?? "Device ID Android merchant belum diverifikasi."}</span>
          </p>
        ) : (
          <p className="alert alert-success qris-merchant-warning">
            <ShieldCheck aria-hidden="true" size={18} />
            <span>Provider akan menerima konfirmasi hanya dari package tepercaya: {provider?.trustedPackageNames.join(", ") || "-"}.</span>
          </p>
        )}

        <div className="payment-method-footer">
          <p className="fine-print">
            QRIS statis tidak dikirim ke Telegram. Setiap invoice menggunakan snapshot terenkripsi agar pergantian merchant tidak mengubah invoice lama.
          </p>
          <button
            className="button button-primary"
            disabled={!formValid || submitting || decodingImage}
            type="button"
            onClick={() => setConfirmOpen(true)}
          >
            <Save aria-hidden="true" size={17} /> Tinjau penyimpanan
          </button>
        </div>
      </section>

      {confirmOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) setConfirmOpen(false);
        }}>
          <section aria-labelledby={titleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div><p className="eyebrow">Konfirmasi merchant QRIS</p><h2 id={titleId}>{mode === "create" ? "Simpan merchant baru?" : "Terapkan perubahan merchant?"}</h2></div>
              <button aria-label="Tutup modal" className="modal-close" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <p>
              <strong>{normalizedName}</strong> akan disimpan sebagai {provider?.displayName ?? providerKey} dengan status {activateAfterSave ? "langsung aktif untuk checkout baru" : enabled ? "dapat dipilih" : "nonaktif"}.
              {normalizedPayload ? " Payload QRIS akan divalidasi dan mengganti payload tersimpan." : " Payload tersimpan tidak diubah."}
              {providerKey === "SHOPEE_PARTNER" && shopeeSessionId !== "__keep"
                ? shopeeSessionId
                  ? " Akun Shopee pada session terpilih akan diikat ke merchant ini."
                  : " Merchant ini tidak memiliki binding web-session; mode Android tetap dapat dipakai."
                : null}
            </p>
            <form action={action} className="admin-modal-actions" method="post" onSubmit={() => setSubmitting(true)}>
              <input name="slug" type="hidden" value={normalizedSlug} />
              <input name="name" type="hidden" value={normalizedName} />
              <input name="providerKey" type="hidden" value={providerKey} />
              <input name="enabled" type="hidden" value={enabled ? "true" : "false"} />
              <input name="trustedDeviceId" type="hidden" value={normalizedDeviceId} />
              <input name="basePayload" type="hidden" value={normalizedPayload} />
              {providerKey === "SHOPEE_PARTNER" && shopeeSessionId !== "__keep" ? (
                <input name="shopeeSessionId" type="hidden" value={shopeeSessionId} />
              ) : null}
              {mode === "create" ? <input name="activateAfterSave" type="hidden" value={activateAfterSave ? "true" : "false"} /> : null}
              <button className="button button-primary" disabled={submitting} type="submit"><Save aria-hidden="true" size={17} /> {submitting ? "Menyimpan..." : "Ya, simpan"}</button>
              <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}>Batal</button>
            </form>
          </section>
        </div>
      ) : null}

      {decodingImage ? (
        <AdminProcessingOverlay
          title="Gambar QRIS sedang dibaca"
          description="Sistem sedang mendeteksi QR dan mengambil payload pembayaran dari gambar."
        />
      ) : submitting ? (
        <AdminProcessingOverlay
          title="Merchant QRIS sedang disimpan"
          description="Sistem sedang memvalidasi CRC, mengenkripsi payload, dan memperbarui konfigurasi merchant."
        />
      ) : null}
    </>
  );
}
