import { useEffect, useState } from "react";

export function ModalScrollPreview() {
  const [open,setOpen]=useState(false);
  useEffect(()=>{
    if(!open)return;
    const overflow=document.body.style.overflow;
    const padding=document.body.style.paddingRight;
    document.body.style.paddingRight=`${window.innerWidth-document.documentElement.clientWidth}px`;
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=overflow;document.body.style.paddingRight=padding;};
  },[open]);
  return <main className="page-width" style={{paddingBlock:40,minHeight:2200}}>
    <h1 style={{fontSize:32}}>Preview penguncian scroll login</h1><p>Gulir ke tombol di bawah. Tidak memakai akun atau data pembayaran nyata.</p>
    <div style={{height:650}} /><button className="button button-primary" onClick={()=>setOpen(true)}>Buka popup contoh</button>
    {open?<div className="cl-modalBackdrop" style={{position:"fixed",inset:0,zIndex:1000,background:"#0009",display:"grid",placeItems:"center"}}><section role="dialog" aria-modal="true" aria-label="Popup contoh" style={{padding:24,borderRadius:20,background:"white",width:"min(420px,90vw)"}}><h2 style={{fontSize:24}}>Popup contoh</h2><p>Navbar tetap di atas, di belakang overlay.</p><button autoFocus className="button button-primary" onClick={()=>setOpen(false)}>Tutup popup</button></section></div>:null}
  </main>;
}
