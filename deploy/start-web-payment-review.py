"""Contain the reported Web payment incident through the existing admin action."""
import json
import subprocess

code = """
import {createHmac} from 'node:crypto';
const sign=value=>createHmac('sha256',process.env.AUTH_SECRET).update(value).digest('hex');
const payload=Buffer.from(JSON.stringify({email:process.env.ADMIN_EMAIL,expiresAt:Math.floor(Date.now()/1000)+300,passwordVersion:sign(process.env.ADMIN_PASSWORD_HASH)})).toString('base64url');
const response=await fetch('http://127.0.0.1:3000/api/admin/maintenance',{method:'POST',redirect:'manual',headers:{origin:new URL(process.env.APP_URL).origin,cookie:'telegram_store_admin='+payload+'.'+sign(payload)},body:new URLSearchParams({enabled:'true',message:'Pemeriksaan pembayaran website sedang berlangsung. Checkout sementara ditutup.'})});
console.log(JSON.stringify({maintenance_enabled:response.status===303&&(response.headers.get('location')??'').includes('notice=maintenance-enabled')}));
"""
result = subprocess.run(['docker', 'exec', '-i', 'telegram-store-app-1', 'node', '--input-type=module'], input=code, text=True, capture_output=True, check=True)
state = json.loads(result.stdout)
assert state['maintenance_enabled']
print(json.dumps(state))
