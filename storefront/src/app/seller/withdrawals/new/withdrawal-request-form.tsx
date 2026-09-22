"use client";

import { useState } from "react";

type Account = { id: string; bank: string; holder: string; masked: string };

export function WithdrawalRequestForm({ accounts }: { accounts: Account[] }) {
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting"); setMessage("");
    try {
      const response = await fetch("/api/seller/withdrawals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount, accountId, requestKey: crypto.randomUUID() }) });
      const data = await response.json() as { ok?: boolean; code?: string };
      if (!response.ok || !data.ok) throw new Error(data.code ?? "withdrawal_unavailable");
      setState("success"); setMessage("Permintaan payout sudah dikirim ke admin untuk diproses."); setAmount("");
    } catch (error) { setState("error"); setMessage(error instanceof Error && error.message === "insufficient_available_balance" ? "Saldo tersedia belum cukup." : "Permintaan belum tersimpan. Periksa rekening dan saldo, lalu coba lagi."); }
  }
  return <form className="seller-withdrawal-form" onSubmit={submit}><label>Rekening payout<select value={accountId} onChange={(event) => setAccountId(event.target.value)} required><option value="">Pilih rekening</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.bank} · {account.masked} · {account.holder}</option>)}</select></label><label>Nominal (rupiah)<input inputMode="numeric" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))} placeholder="100000" required /></label><button className="seller-button" disabled={state === "submitting" || !accountId}>{state === "submitting" ? "Mengirim…" : "Ajukan ke admin"}</button>{message ? <p className={state === "error" ? "seller-warning" : "seller-success"} role="status">{message}</p> : null}</form>;
}
