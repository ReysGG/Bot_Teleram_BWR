import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
const demoSmsServices = (JSON.parse(readFileSync(path("../../../design/sms/provider-services-20260921.json"), "utf8")) as Array<{ID:number;name:string}>).map(s => ({id:Number(s.ID),name:s.name}));
export default defineConfig({
  plugins: [{ name: "demo-guide-download", configureServer(server) { server.middlewares.use((req, res, next) => {
    if (req.url?.startsWith("/api/sms")) {
      const order = { id: "demo-sms-order", serviceName: "OpenAI", countryName: "United States", countryCode: "US", price: 7000, status: "ACTIVE", phoneNumber: "+1 202 555 0147", otpCode: null, fullCode: null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+15*60_000).toISOString(), refundedAt: null };
      res.setHeader("Content-Type", "application/json");
      if (req.url.includes("/orders/")) { res.end(JSON.stringify({ ok: true, order: req.method === "POST" ? { ...order, status: "COMPLETED", otpCode: "246810", fullCode: "DEMO ONLY - kode contoh untuk preview" } : order })); return; }
      if (req.method === "POST") { res.end(JSON.stringify({ ok: true, order })); return; }
      if (req.url.includes("view=orders")) { res.end(JSON.stringify({ ok: true, orders: [order], nextCursor: null })); return; }
      res.end(JSON.stringify({ ok: true, balance: 55000, walletEnabled: true, maintenance: false, services: demoSmsServices, countries: req.url.includes("serviceId") ? [{id:1,name:"United States",code:"US",price:7000,successRate:98},{id:2,name:"Indonesia",code:"ID",price:5000,successRate:96},{id:3,name:"United Kingdom",code:"GB",price:9000,successRate:97}] : [] })); return;
    }
    if (req.url === "/api/orders/DEMO-INVOICE-001/deliveries/demo-file") {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", 'attachment; filename="contoh-produk.txt"');
      res.end("FILE DEMO - bukan akun asli\nLink contoh: https://example.com/claim\nSimpan ke Files atau salin teks dari halaman pesanan."); return;
    }
    if (req.url === "/api/orders/DEMO-INVOICE-001/login") {
      if (req.method === "POST") { res.setHeader("Content-Type", "text/plain"); res.end("DEMO ONLY - no credentials"); }
      else { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({eligible:1,available:1,missing:0})); } return;
    }
    if (req.url === "/api/orders/DEMO-INVOICE-001/qris") {
      res.setHeader("Content-Type", "image/svg+xml"); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect x="1" y="1" width="298" height="298" rx="14" fill="#f1f6ff" stroke="#dbe7ff"/><text x="150" y="140" text-anchor="middle" fill="#1b63ec" font-family="sans-serif" font-size="20">AREA QRIS</text><text x="150" y="170" text-anchor="middle" fill="#536581" font-family="sans-serif" font-size="13">PREVIEW ? BUKAN KODE BAYAR</text></svg>'); return;
    }
    if (req.url === "/api/catalog/search-index") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({products:[
        {id:"demo-gpt",slug:"demo-gpt",name:"ChatGPT Plus",price:50000,availability:"IN_STOCK",featured:true,category:"ChatGPT",variant:"",tags:"coding",keywords:"asisten kerja"},
        {id:"demo-mail",slug:"demo-mail",name:"Mail Outlook/Hotmail",price:500,availability:"IN_STOCK",featured:false,category:"Email",variant:"",tags:"mail",keywords:"email"},
        ...Array.from({length:4},(_,i)=>({id:`demo-extra-${i}`,slug:`demo-extra-${i}`,name:`Produk digital contoh ${i+1}`,price:3000,availability:"IN_STOCK",featured:false,category:"Contoh",variant:"",tags:"",keywords:""}))
      ]})); return;
    }
    if (req.url !== "/api/orders/DEMO-CLAIM-001/attachments/demo-claim") return next();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="panduan-aktivasi.txt"');
    res.end("PANDUAN DEMO\nIni file contoh untuk preview UI. Tidak ada kode, akun, atau produk nyata.\n1. Download produk.\n2. Buka tempat claim.\n3. Ikuti petunjuk produk.\n");
  }); } }],
  root: path("./"), publicDir: path("../../public"),
  server: { host: "127.0.0.1", port: 4175, strictPort: true },
  resolve: { alias: {
    "@/lib/test-payments": path("./mock-test-payments.ts"),
    "@/components/cart/cart-context": path("./mock-cart.tsx"),
    "@clerk/nextjs": path("./mock-clerk.tsx"),
    "next/link": path("./mock-link.tsx"), "next/image": path("./mock-image.tsx"), "next/navigation": path("./mock-navigation.ts"),
    "@": path("../../src"), "react": path("../../../node_modules/react"), "react-dom": path("../../../node_modules/react-dom"),
  } },
  define: { "process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME": '""' },
});
