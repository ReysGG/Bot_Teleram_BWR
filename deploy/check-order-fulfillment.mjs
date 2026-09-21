import {createHmac} from 'node:crypto';
const sign=v=>createHmac('sha256',process.env.AUTH_SECRET).update(v).digest('hex');
const payload=Buffer.from(JSON.stringify({email:process.env.ADMIN_EMAIL,expiresAt:Math.floor(Date.now()/1000)+300,passwordVersion:sign(process.env.ADMIN_PASSWORD_HASH)})).toString('base64url');
const headers={cookie:'telegram_store_admin='+payload+'.'+sign(payload)};
const invoice='TGS-20260921-E4A6CBCC';
const list=await fetch('http://127.0.0.1:3000/admin/orders?q='+invoice,{headers}).then(r=>r.text());
const paths=[...new Set([...list.matchAll(/href="(\/admin\/orders\/[^"?]+)"/g)].map(m=>m[1]))];
for(const path of paths){
 if(path.endsWith('/payment-approval'))continue;
 const r=await fetch('http://127.0.0.1:3000'+path,{headers});
 const html=await r.text();
 const clean=html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 // Detail page contains metadata only; restrict output to status/fulfillment sections.
 const start=clean.indexOf(invoice);
 console.log(JSON.stringify({status:r.status,path,details:clean.slice(start,start+9000)}));
}
