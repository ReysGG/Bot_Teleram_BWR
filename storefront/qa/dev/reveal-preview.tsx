import { useState } from "react";
import { OrderReveal, type RevealOrder } from "../../src/components/orders/order-reveal";
import { ClaimPreview } from "./claim-preview";

type Scenario = "ready" | "processing" | "preorder" | "pending" | "expired" | "delivered";
export function RevealPreview() {
  const [scenario, setScenario] = useState<Scenario>("ready");
  const [id, setId] = useState("DEMO-REVEAL-001");
  const order: RevealOrder = { id, productName: "Paket produk digital contoh", status: scenario === "preorder" ? "PAID_WAITING_STOCK" : scenario === "pending" ? "PENDING_PAYMENT" : scenario === "expired" ? "EXPIRED" : "FULFILLING", paymentStatus: ["pending", "expired"].includes(scenario) ? "PENDING" : "PAID", deliveryState: scenario === "ready" ? "READY" : scenario === "delivered" ? "DELIVERED" : scenario === "expired" ? "EXPIRED" : "PROCESSING", quantity: 1, readyFiles: scenario === "ready" ? 1 : 0, deliveredFiles: scenario === "delivered" ? 1 : 0 };
  return <><div className="page-width" style={{ paddingBlock: 20 }}><div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 20 }}>
    <label>Status contoh <select aria-label="Status contoh" value={scenario} onChange={event => { setScenario(event.target.value as Scenario); setId(`DEMO-REVEAL-${crypto.randomUUID()}`); }}>{[["ready", "Produk siap"], ["processing", "Masih disiapkan"], ["preorder", "Preorder"], ["pending", "Belum bayar"], ["expired", "Kedaluwarsa"], ["delivered", "Sudah diambil"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <button className="button button-quiet" type="button" onClick={() => { setScenario("ready"); setId(`DEMO-REVEAL-${crypto.randomUUID()}`); }}>Putar ulang contoh</button>
    {scenario === "processing" ? <button className="button button-primary" type="button" onClick={() => setScenario("ready")}>Simulasikan produk siap</button> : null}
    <small>Hanya simulasi UI. Status produksi berasal dari server.</small>
  </div><OrderReveal key={id} order={order} /></div>
  {scenario === "ready" || scenario === "delivered" ? <ClaimPreview /> : <main className="page-width" style={{ minHeight: 350 }}><p>{scenario === "pending" ? "Invoice belum dibayar. Animasi pembukaan tidak ditampilkan." : scenario === "expired" ? "Invoice kedaluwarsa. Animasi sukses tidak ditampilkan." : "Produk belum tersedia. Coba ubah status contoh untuk melanjutkan."}</p></main>}</>;
}
