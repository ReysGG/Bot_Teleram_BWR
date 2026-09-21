"""Read only the identified invoice through the existing admin page."""
import json
import subprocess
from html.parser import HTMLParser

code = """
import {createHmac} from 'node:crypto';
const sign=value=>createHmac('sha256',process.env.AUTH_SECRET).update(value).digest('hex');
const payload=Buffer.from(JSON.stringify({email:process.env.ADMIN_EMAIL,expiresAt:Math.floor(Date.now()/1000)+300,passwordVersion:sign(process.env.ADMIN_PASSWORD_HASH)})).toString('base64url');
const r=await fetch('http://127.0.0.1:3000/admin/orders/5632e678-d3ae-4ffe-9a99-d7658164259c',{headers:{cookie:'telegram_store_admin='+payload+'.'+sign(payload)}});
if(!r.ok||r.url.includes('/admin/login'))throw Error('Authenticated read failed');
console.log(JSON.stringify({html:await r.text()}));
"""
result = subprocess.run(['docker', 'exec', '-i', 'telegram-store-app-1', 'node', '--input-type=module'], input=code, text=True, capture_output=True, check=True)
class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.skip = 0; self.parts = []; self.main = 0
    def handle_starttag(self, tag, attrs):
        if tag in ['script', 'style']: self.skip += 1
        if tag == 'main': self.main += 1
    def handle_endtag(self, tag):
        if tag in ['script', 'style']: self.skip = max(0, self.skip - 1)
        if tag == 'main': self.main = max(0, self.main - 1)
    def handle_data(self, text):
        if not self.skip and text.strip(): self.parts.append(text.strip())
parser = Text(); parser.feed(json.loads(result.stdout)['html'])
start = parser.parts.index('Order detail') if 'Order detail' in parser.parts else 0
print('\n'.join(parser.parts[start:])[:14000])
