"""Finish the approved rollout after production identity and frontend QA pass."""
import json
from pathlib import Path
import subprocess
import urllib.request
from datetime import datetime, timezone

stage = Path('/home/azureuser/storefront-activation-20260915')
record = json.loads((stage / 'rollout-state.json').read_text())
assert record['stage'] == 'backend_ready_under_maintenance'

def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]

def node(code):
    result = subprocess.run(['docker', 'exec', '-i', 'telegram-store-app-1', 'node', '--input-type=module'], input=code, text=True, capture_output=True, check=True)
    return json.loads(result.stdout)

assert inspect('telegram-store-db-1')['Id'] == record['db_container']
assert inspect('telegram-store-app-1')['State']['Health']['Status'] == 'healthy'
for service in ['telegram-store-scheduler-1', 'telegram-store-notification-worker-1']:
    assert inspect(service)['State']['Running']
for url in ['https://store.buildwithreys.com/api/health', 'https://70-153-137-10.sslip.io/api/health', 'https://clerk.store.buildwithreys.com/.well-known/jwks.json']:
    with urllib.request.urlopen(url, timeout=25) as response:
        assert response.status == 200

workers = node("""
const results = {};
for (const path of ['/api/cron/orders/expire','/api/cron/notifications/fast']) {
 const response=await fetch('http://127.0.0.1:3000'+path,{headers:{authorization:'Bearer '+process.env.APP_CRON_SECRET},signal:AbortSignal.timeout(60000)});
 const data=await response.json();
 results[path]={status:response.status,ok:data.ok,expired:data.expired,data:data.data};
}
const webhook=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/getWebhookInfo',{signal:AbortSignal.timeout(15000)}).then(r=>r.json());
results.webhook={ok:webhook.ok,pending: webhook.result?.pending_update_count};
console.log(JSON.stringify(results));
""")
assert workers['/api/cron/orders/expire']['ok']
assert workers['/api/cron/notifications/fast']['ok']
assert workers['/api/cron/notifications/fast'].get('data', {}).get('failed', 0) == 0
assert workers['/api/cron/notifications/fast'].get('data', {}).get('manualReview', 0) == 0
assert workers['/api/cron/notifications/fast'].get('data', {}).get('retry', 0) == 0
assert workers['webhook']['ok'] and workers['webhook']['pending'] == 0

result = node("""
import {createHmac,createHash,randomUUID} from 'node:crypto';
const sign=value=>createHmac('sha256',process.env.AUTH_SECRET).update(value).digest('hex');
const payload=Buffer.from(JSON.stringify({email:process.env.ADMIN_EMAIL,expiresAt:Math.floor(Date.now()/1000)+300,passwordVersion:sign(process.env.ADMIN_PASSWORD_HASH)})).toString('base64url');
async function maintenance(enabled){const r=await fetch('http://127.0.0.1:3000/api/admin/maintenance',{method:'POST',redirect:'manual',headers:{origin:new URL(process.env.APP_URL).origin,cookie:'telegram_store_admin='+payload+'.'+sign(payload)},body:new URLSearchParams({enabled:String(enabled)})});return r.status===303&&(r.headers.get('location')??'').includes('notice=maintenance-'+(enabled?'enabled':'disabled'));}
if(!await maintenance(false)) throw Error('Maintenance release failed');
try {
 const path='/api/storefront/v1/catalog', timestamp=String(Date.now()),id=randomUUID();
 const signature=createHmac('sha256',process.env.STOREFRONT_API_SHARED_SECRET).update([timestamp,id,'GET',path,createHash('sha256').update('').digest('hex')].join('.')).digest('hex');
 const r=await fetch('http://127.0.0.1:3000'+path,{headers:{'x-storefront-key-id':process.env.STOREFRONT_API_KEY_ID,'x-storefront-timestamp':timestamp,'x-storefront-request-id':id,'x-storefront-signature':signature}});
 const catalog=await r.json();if(!r.ok||!catalog.paymentMethods?.length)throw Error('No available checkout methods');
 console.log(JSON.stringify({maintenance:false,products:catalog.products.length,payment_methods:catalog.paymentMethods}));
} catch(error) {await maintenance(true);throw error;}
""")
record.update({'stage': 'backend_complete', 'finished_at': datetime.now(timezone.utc).isoformat(), 'workers': workers, 'checkout': result})
(stage / 'rollout-state.json').write_text(json.dumps(record, indent=2))
print(json.dumps({'stage': record['stage'], 'workers': workers, 'checkout': result}), flush=True)
