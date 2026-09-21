"""Inspect existing rendered ledgers for the reported amount; never mutate data."""
import json
import re
import subprocess
from html.parser import HTMLParser

code = """
import {createHmac} from 'node:crypto';
const sign=value=>createHmac('sha256',process.env.AUTH_SECRET).update(value).digest('hex');
const payload=Buffer.from(JSON.stringify({email:process.env.ADMIN_EMAIL,expiresAt:Math.floor(Date.now()/1000)+300,passwordVersion:sign(process.env.ADMIN_PASSWORD_HASH)})).toString('base64url');
const pages={};
for(const path of ['/admin/payments/qris?qq=TGS-20260915-467A7796','/admin/payments/shopee','/admin/payments/reconciliation']){
 const r=await fetch('http://127.0.0.1:3000'+path,{headers:{cookie:'telegram_store_admin='+payload+'.'+sign(payload)}});
 if(!r.ok||r.url.includes('/admin/login'))throw Error('Authenticated read failed');
 pages[path]=await r.text();
}
console.log(JSON.stringify(pages));
"""
result = subprocess.run(['docker','exec','-i','telegram-store-app-1','node','--input-type=module'],input=code,text=True,capture_output=True,check=True)
class Rows(HTMLParser):
    def __init__(self): super().__init__(); self.rows=[]; self.active=[]; self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag=='tr':self.active.append([])
        if tag=='a':
            href=dict(attrs).get('href','')
            if '/admin/payments/reconciliation' in href and 'event=' in href:
                for row in self.active:row.append('[review='+href+']')
    def handle_data(self,text):
        for row in self.active:row.append(text)
    def handle_endtag(self,tag):
        if tag=='tr' and self.active:self.rows.append(' '.join(' '.join(self.active.pop()).split()))
for path,document in json.loads(result.stdout).items():
    parser=Rows();parser.feed(document)
    rows=[row for row in parser.rows if re.search(r'Rp\s*567(?:\D|$)',row) or 'TGS-20260915-467A7796' in row]
    print(json.dumps({'page':path,'matching_rows':rows,'review_links':parser.links if rows and 'reconciliation' in path else []},ensure_ascii=False))
