"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyValueButton({ value, label = "Salin" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button className="button button-small button-ghost" type="button" onClick={copy}>
      {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
      {copied ? "Tersalin" : label}
    </button>
  );
}
