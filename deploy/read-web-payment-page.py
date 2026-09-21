"""Read the existing authenticated admin page; no direct SQL or data changes."""
import html
import json
import re
import subprocess
from html.parser import HTMLParser

code = """
import {createHmac} from 'node:crypto';
const sign=value=>createHmac('sha256',process.env.AUTH_SECRET).update(value).digest('hex');
const payload=Buffer.from(JSON.stringify({email:process.env.ADMIN_EMAIL,expiresAt:Math.floor(Date.now()/1000)+300,passwordVersion:sign(process.env.ADMIN_PASSWORD_HASH)})).toString('base64url');
const r=await fetch('http://127.0.0.1:3000/admin/orders?q=TGS-20260915-467A7796',{headers:{cookie:'telegram_store_admin='+payload+'.'+sign(payload)}});
if(!r.ok||r.url.includes('/admin/login'))throw Error('Authenticated read failed');
console.log(JSON.stringify({html:await r.text()}));
"""
result = subprocess.run(['docker', 'exec', '-i', 'telegram-store-app-1', 'node', '--input-type=module'], input=code, text=True, capture_output=True, check=True)
document = json.loads(result.stdout)['html']
class Rows(HTMLParser):
    def __init__(self):
        super().__init__(); self.stack = []; self.rows = []
    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'tr': self.stack.append({'text': [], 'links': []})
        if tag == 'a' and '/admin/orders/' in attrs.get('href', ''):
            for row in self.stack: row['links'].append(attrs['href'])
    def handle_data(self, text):
        for row in self.stack: row['text'].append(text)
    def handle_endtag(self, tag):
        if tag == 'tr' and self.stack: self.rows.append(self.stack.pop())
parser = Rows(); parser.feed(document)
matches = []
for row in parser.rows:
    text = ' '.join(' '.join(row['text']).split())
    if 'outlook' in text.lower() and re.search(r'Rp\s*567(?:\D|$)', text):
        matches.append({'text': text, 'order_links': list(dict.fromkeys(row['links']))})
links = list(dict.fromkeys(re.findall(r'/admin/orders/[A-Za-z0-9_-]+', document)))
print(json.dumps({'matching_rows': matches, 'detail_links_on_exact_invoice_page': links}, ensure_ascii=False))
