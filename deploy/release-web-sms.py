"""Schema-free SMS website release. Run with sudo on the current host."""
import json, subprocess, time, shutil
from pathlib import Path

def run(*args):
    return subprocess.check_output(args, text=True)

def node(code):
    result = subprocess.run(['docker','exec','-i','telegram-store-app-1','node','--input-type=module'], input=code, text=True, capture_output=True, check=True)
    return json.loads(result.stdout)

auth = """
import {createHmac} from 'node:crypto';
const sign=v=>createHmac('sha256',process.env.AUTH_SECRET).update(v).digest('hex');
const payload=Buffer.from(JSON.stringify({email:process.env.ADMIN_EMAIL,expiresAt:Math.floor(Date.now()/1000)+300,passwordVersion:sign(process.env.ADMIN_PASSWORD_HASH)})).toString('base64url');
"""
def maintenance(value):
    result=node(auth+"""
const enabled=VALUE;
const r=await fetch('http://127.0.0.1:3000/api/admin/maintenance',{method:'POST',redirect:'manual',headers:{origin:new URL(process.env.APP_URL).origin,cookie:'telegram_store_admin='+payload+'.'+sign(payload)},body:new URLSearchParams({enabled:String(enabled),message:'Pembaruan layanan SMS. Silakan tunggu sebentar.'})});
console.log(JSON.stringify({ok:r.status===303&&(r.headers.get('location')??'').includes('notice=maintenance-'+(enabled?'enabled':'disabled'))}));
""".replace('VALUE',str(value).lower()))
    assert result['ok'], 'Maintenance action failed'

back=Path('/opt/telegram-store/docker-compose.production.yml')
front=Path('/opt/storefront/docker-compose.yml')
env=Path('/opt/telegram-store/.env.production')
original={p:p.read_text() for p in [back,front,env]}
for p in [back,front]:
    shutil.copy2(p,str(p)+'.before-web-sms-20260922')
def compose(path,*args):
    return run('docker','compose','--project-directory',str(path.parent),'-f',str(path),*args)
def healthy(name):
    for _ in range(36):
        state=json.loads(run('docker','inspect',name))[0]['State']
        if state.get('Health',{}).get('Status')=='healthy': return
        time.sleep(2)
    raise RuntimeError('Health failed: '+name)

baseline={name:json.loads(run('docker','inspect',name))[0]['Id'] for name in ['telegram-store-db-1','telegram-store-scheduler-1','telegram-store-notification-worker-1','telegram-store-caddy-1']}
try:
    assert 'telegram-app:worker-idle-20260921' in original[back]
    assert 'telegram-storefront:mobile-shortcuts-20260921' in original[front]
    maintenance(True)
    back.write_text(original[back].replace('telegram-app:worker-idle-20260921','telegram-app:web-sms-20260921'))
    front.write_text(original[front].replace('telegram-storefront:mobile-shortcuts-20260921','telegram-storefront:web-sms-20260921'))
    lines=[line for line in original[env].splitlines() if not line.startswith('STOREFRONT_SMS_ENABLED=')]
    env.write_text('\n'.join(lines)+'\nSTOREFRONT_SMS_ENABLED=true\n')
    for p in [back,front]: compose(p,'config','--quiet')
    compose(back,'up','-d','--no-deps','app'); healthy('telegram-store-app-1')
    compose(front,'up','-d','--no-deps','app'); healthy('storefront-app-1')
    for name,ident in baseline.items():
        info=json.loads(run('docker','inspect',name))[0]
        assert info['Id']==ident and info['State']['Running'],name
    checks=node("""
const paths=['/api/health','/api/cron/notifications','/api/cron/notifications/fast','/api/cron/orders/expire','/api/cron/stock/health','/api/cron/payments/shopee','/api/cron/payments/shopee/match','/api/cron/payments/binance-internal','/api/cron/payments/binance-web','/api/cron/payments/binance-web/match','/api/cron/payments/usdt-bep20'];
const results={};
for(const path of paths){const r=await fetch('http://127.0.0.1:3000'+path,{headers:{authorization:'Bearer '+process.env.APP_CRON_SECRET},signal:AbortSignal.timeout(60000)}); results[path]={status:r.status}; if(path==='/api/cron/notifications'){const d=await r.json();results[path].smsPool=d.smsPool;}}
results.smsEnabled=process.env.STOREFRONT_SMS_ENABLED==='true';
results.unsignedSms=(await fetch('http://127.0.0.1:3000/api/storefront/v1/sms')).status;
console.log(JSON.stringify(results));
""")
    assert all(v['status']==200 for v in checks.values() if isinstance(v,dict)),checks
    assert checks['smsEnabled'] and checks['unsignedSms']==401
    for url in ['https://store.buildwithreys.com/api/health','https://api.buildwithreys.com/api/health','https://store.buildwithreys.com/sms']:
        assert run('curl','-sS','-o','/dev/null','-w','%{http_code}',url)=='200',url
    maintenance(False)
    Path('/opt/telegram-store/web-sms-release-20260922.json').write_text(json.dumps(checks,indent=2))
    print(json.dumps({'released':True,'checks':checks,'unchangedServices':list(baseline)}))
except Exception:
    for p,content in original.items(): p.write_text(content)
    for p in [back,front]: compose(p,'up','-d','--no-deps','app')
    healthy('telegram-store-app-1'); healthy('storefront-app-1')
    maintenance(False)
    raise
