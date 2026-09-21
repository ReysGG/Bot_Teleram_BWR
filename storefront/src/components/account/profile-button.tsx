"use client";
import { useClerk, useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { formatRupiah } from "@/lib/catalog-types";

export function ProfileButton({ showName = false }: { showName?: boolean }) {
  const { user } = useUser();
  return user ? <ProfileMenu key={user.id} user={user} showName={showName} /> : null;
}
function ProfileMenu({ user, showName }: { user: { id: string; imageUrl: string; fullName: string | null; primaryEmailAddress: { emailAddress: string } | null }; showName: boolean }) {
  const clerk = useClerk();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/customer/account", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json();
      if (!Number.isSafeInteger(data.balance)) throw new Error("invalid");
      if (!controller.signal.aborted) { setBalance(data.balance); setFailed(false); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    host.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => { controller.abort(); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  const label = user.primaryEmailAddress?.emailAddress ?? user.fullName ?? "Akun saya";
  const avatar = user.imageUrl ? <Image src={user.imageUrl} alt="" width={40} height={40} unoptimized /> : <Icon name="user" size={23} />;
  return <div className="profile-menu-host" ref={host}>
    <button className="profile-avatar-button" type="button" aria-label="Buka menu profil" aria-haspopup="menu" aria-expanded={open} ref={trigger} onClick={() => { if (!open) { setBalance(null); setFailed(false); } setOpen(value => !value); }}>{avatar}{showName ? <span>{user.fullName ?? "Akun saya"}</span> : null}</button>
    {open ? <div className="profile-dropdown" role="menu" aria-label="Menu profil" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>
      <div className="profile-identity">{avatar}<strong>{label}</strong></div>
      <Link role="menuitem" href="/account/wallet" className="profile-wallet-row" onClick={() => setOpen(false)}><Icon name="wallet" size={21} /><span><small>Saldo akun</small><strong aria-live="polite">{balance !== null ? formatRupiah(balance) : failed ? "Lihat saldo & riwayat" : "Memuat saldo..."}</strong></span><Icon name="chevron-right" size={17} /></Link>
      <button role="menuitem" type="button" onClick={() => { setOpen(false); clerk.openUserProfile(); }}><Icon name="user" size={19} />Kelola akun</button>
      <button role="menuitem" type="button" onClick={() => { setOpen(false); void clerk.signOut({ redirectUrl: "/" }); }}><Icon name="arrow-right" size={19} />Keluar</button>
    </div> : null}
  </div>;
}
