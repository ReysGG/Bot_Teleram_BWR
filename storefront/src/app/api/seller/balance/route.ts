import { NextResponse } from "next/server";
import { requireActiveSeller } from "@/server/seller/access";
import { sellerBalance } from "@/server/seller/finance";
export async function GET(){try{return NextResponse.json({ok:true,...await sellerBalance((await requireActiveSeller()).id)},{headers:{"cache-control":"private, no-store"}})}catch{return NextResponse.json({ok:false,code:"seller_access_required"},{status:403})}}
