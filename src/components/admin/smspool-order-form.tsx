"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PhoneCall, X } from "lucide-react";
import type {
  SmsPoolCountry,
  SmsPoolPool,
  SmsPoolService,
} from "@/server/smspool/client";

export function SmsPoolOrderForm({
  countries,
  services,
  pools,
}: {
  countries: SmsPoolCountry[];
  services: SmsPoolService[];
  pools: SmsPoolPool[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const allowSubmitRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState({ country: "", service: "", quantity: "1" });
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (allowSubmitRef.current) return;
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const countryId = String(form.get("country") ?? "");
    const serviceId = String(form.get("service") ?? "");
    setSummary({
      country: countries.find((item) => String(item.ID) === countryId)?.name ?? countryId,
      service: services.find((item) => String(item.ID) === serviceId)?.name ?? serviceId,
      quantity: String(form.get("quantity") ?? "1"),
    });
    setOpen(true);
  }

  function confirmOrder() {
    allowSubmitRef.current = true;
    setOpen(false);
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form
        action="/api/admin/smspool/orders"
        className="stack-form"
        method="post"
        onSubmit={handleSubmit}
        ref={formRef}
      >
        <div className="split-fields">
          <label>
            Negara
            <select defaultValue="9" name="country" required>
              {countries.map((country) => (
                <option key={country.ID} value={country.ID}>
                  {country.name} ({country.short_name})
                </option>
              ))}
            </select>
          </label>
          <label>
            Layanan
            <select defaultValue="" name="service" required>
              <option disabled value="">Pilih layanan</option>
              {services.map((service) => (
                <option key={service.ID} value={service.ID}>{service.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="split-fields">
          <label>
            Pool
            <select defaultValue="" name="pool">
              <option value="">Otomatis</option>
              {pools.map((pool) => (
                <option key={pool.ID} value={pool.ID}>{pool.name}</option>
              ))}
            </select>
          </label>
          <label>
            Prioritas harga
            <select defaultValue="0" name="pricingOption">
              <option value="0">Termurah</option>
              <option value="1">Success rate tertinggi</option>
            </select>
          </label>
        </div>
        <div className="split-fields">
          <label>
            Maksimum harga USD (opsional)
            <input min="0.01" name="maxPrice" placeholder="Contoh: 0.50" step="0.01" type="number" />
          </label>
          <label>
            Jumlah nomor
            <input defaultValue="1" max="10" min="1" name="quantity" required type="number" />
          </label>
        </div>
        <p className="fine-print">
          Harga ditagihkan langsung dari saldo SMSPool. API key hanya digunakan di server.
        </p>
        <button className="button button-primary" type="submit">
          <PhoneCall aria-hidden="true" size={18} />
          Pesan nomor SMS
        </button>
      </form>

      {open ? (
        <div
          className="admin-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          role="presentation"
        >
          <section aria-labelledby={titleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div>
                <p className="eyebrow">Konfirmasi SMSPool</p>
                <h2 id={titleId}>Pesan nomor berbayar?</h2>
              </div>
              <button aria-label="Tutup modal" className="modal-close" onClick={() => setOpen(false)} type="button">
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <p>
              Pesan <strong>{summary.quantity} nomor</strong> untuk <strong>{summary.service}</strong> di <strong>{summary.country}</strong>.
            </p>
            <p className="fine-print">Saldo SMSPool akan terpotong setelah provider menerima order.</p>
            <div className="admin-modal-actions">
              <button className="button button-primary" onClick={confirmOrder} type="button">
                <PhoneCall aria-hidden="true" size={18} />
                Ya, pesan nomor
              </button>
              <button className="button button-ghost" onClick={() => setOpen(false)} type="button">Batal</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
