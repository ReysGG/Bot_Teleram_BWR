"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function SellerDraftForm(){
  const [busy,setBusy]=useState(false),[error,setError]=useState(""); const key=useRef(""); const router=useRouter();
  return <form onChange={()=>{key.current="";}} onSubmit={async e=>{
    e.preventDefault(); if(busy)return; const form=new FormData(e.currentTarget); key.current ||= crypto.randomUUID();
    setBusy(true);setError("");
    try{const r=await fetch("/api/seller/drafts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:form.get("name"),description:form.get("description"),price:Number(form.get("price")),requestKey:key.current})});if(!r.ok)throw new Error(); router.push("/seller/products?notice=created");router.refresh();}catch{setError("Draft belum tersimpan. Periksa akses seller dan isian produk, lalu coba lagi.");}finally{setBusy(false);}
  }}><fieldset disabled={busy} style={{border:0,display:"grid",gap:16}}><label>Nama produk<input name="name" minLength={2} maxLength={100} required /></label><label>Deskripsi<textarea name="description" minLength={5} maxLength={10000} required rows={6}/></label><label>Harga (Rp)<input name="price" type="number" min={1} max={1000000000} step={1} required/></label>{error?<p role="alert">{error}</p>:null}<button className="seller-button" disabled={busy}>{busy?"Menyimpan…":"Simpan draft"}</button></fieldset></form>;
}
