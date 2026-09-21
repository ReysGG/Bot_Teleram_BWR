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
import re
html=json.loads(result.stdout)['html']
checks={'web_account_heading': 'Akun website' in html, 'email_label': 'Email akun:' in html, 'no_telegram_composer': 'Akses pembeli Web' in html and 'Direct communication' not in html, 'email_displayed': bool(re.search(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+', html))}
print(json.dumps(checks))
assert all(checks.values())
