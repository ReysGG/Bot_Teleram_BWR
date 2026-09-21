"""Approved additive cart rollout. Run on Azure; keep maintenance on for final QA."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

BASE = Path('/opt/telegram-store')
STAGE = Path('/home/azureuser/storefront-activation-20260915')
APP = 'telegram-store-app-1'
DB = 'telegram-store-db-1'
MIGRATION = '20260915173000_add_web_cart'
COMPOSE = ['docker', 'compose', '-f', str(BASE / 'docker-compose.yml')]
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = BASE / 'backups' / ('clerk-cart-' + stamp)
record = {'stage': 'preflight', 'stamp': stamp}
maintenance_started = False
replaced = False

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]

def node(code):
    result = run(['docker', 'exec', '-i', APP, 'node', '--input-type=module'],
                 input=code, text=True, capture_output=True)
    return json.loads(result.stdout)

def persist():
    (STAGE / 'rollout-state.json').write_text(json.dumps(record, indent=2))

def health():
    for attempt in range(40):
        if inspect(APP)['State'].get('Health', {}).get('Status') == 'healthy':
            return
        time.sleep(2)
    raise RuntimeError('Backend health timeout')

def maintenance(enabled):
    code = """
import {createHmac} from 'node:crypto';
const sign = value => createHmac('sha256', process.env.AUTH_SECRET).update(value).digest('hex');
const body = Buffer.from(JSON.stringify({email:process.env.ADMIN_EMAIL,expiresAt:Math.floor(Date.now()/1000)+300,passwordVersion:sign(process.env.ADMIN_PASSWORD_HASH)})).toString('base64url');
const enabled = ENABLED;
const response = await fetch('http://127.0.0.1:3000/api/admin/maintenance', {method:'POST',redirect:'manual',headers:{origin:new URL(process.env.APP_URL).origin,cookie:'telegram_store_admin='+body+'.'+sign(body)},body:new URLSearchParams({enabled:String(enabled),message:'Pembaruan integrasi akun website. Checkout sementara ditutup.'})});
console.log(JSON.stringify({ok:response.status===303 && (response.headers.get('location')??'').includes('notice=maintenance-'+(enabled?'enabled':'disabled'))}));
""".replace('ENABLED', 'true' if enabled else 'false')
    assert node(code)['ok'], 'Admin maintenance action failed'

try:
    assert hashlib.file_digest((STAGE / 'images.tar.gz').open('rb'), 'sha256').hexdigest() == 'cccd49f0d8abddcd54019eab76f61b9e880e0572c87b5ebd16ce7eb314e8a9cb'
    old_app = inspect(APP)
    old_migrator = inspect('telegram-migrate:production')['Id']
    db = inspect(DB)
    assert db['Id'] == '359356a8f9adac28a5cc64218444ff46ca20f30804e6ea8b62b7af7c80abe4be'
    assert old_app['State']['Health']['Status'] == 'healthy'
    candidate = inspect('telegram-app:clerk-candidate-20260915')['Id']
    candidate_migrator = inspect('telegram-migrate:clerk-candidate-20260915')['Id']
    db_env = dict(line.split('=', 1) for line in db['Config']['Env'] if '=' in line)
    sql_command = ['docker', 'exec', DB, 'psql', '-U', db_env['POSTGRES_USER'], '-d', db_env['POSTGRES_DB'], '-At', '-v', 'ON_ERROR_STOP=1', '-c']
    def sql(query):
        return subprocess.check_output(sql_command + [query], text=True).strip()
    applied = set(sql('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL').splitlines())
    manifest = set(json.loads((STAGE / 'migration-manifest.json').read_text(encoding='utf-8-sig')))
    assert not applied - manifest, 'Unexpected production migration history'
    assert manifest - applied in ({MIGRATION}, set()), 'Unexpected pending migrations'
    assert sql('SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL') == '0'
    env_path = BASE / '.env.production'
    original = env_path.read_text()
    key_path = STAGE / '.env.backend-clerk-production'
    os.chmod(key_path, 0o600)
    changes = dict(line.split('=', 1) for line in key_path.read_text().splitlines() if '=' in line)
    allowed = {'STOREFRONT_CLERK_ENABLED', 'STOREFRONT_CLERK_ISSUER', 'STOREFRONT_CLERK_JWT_KEY', 'STOREFRONT_CLERK_AUTHORIZED_PARTIES', 'STOREFRONT_CLERK_SECRET_KEY'}
    assert set(changes) == allowed
    assert json.loads(changes['STOREFRONT_CLERK_ISSUER']) == 'https://clerk.store.buildwithreys.com'
    assert json.loads(changes['STOREFRONT_CLERK_SECRET_KEY']).startswith('sk_live_')
    changes['STOREFRONT_CLERK_ENABLED'] = '"true"'
    backup.mkdir(mode=0o700, parents=True, exist_ok=False)
    shutil.copy2(env_path, backup / '.env.production')
    shutil.copy2(BASE / 'docker-compose.yml', backup / 'docker-compose.yml')
    os.chmod(backup / '.env.production', 0o600)
    rollback_app = 'telegram-app:rollback-clerk-cart-' + stamp
    rollback_migrator = 'telegram-migrate:rollback-clerk-cart-' + stamp
    run(['docker', 'tag', old_app['Image'], rollback_app])
    run(['docker', 'tag', old_migrator, rollback_migrator])
    record.update({'backup_directory': str(backup), 'rollback_app': rollback_app, 'rollback_migrator': rollback_migrator, 'db_container': db['Id']})
    maintenance(True)
    maintenance_started = True
    assert sql('SELECT "maintenanceMode" FROM "StoreRuntimeSetting" WHERE id = \'global\'') == 't'
    record['stage'] = 'maintenance_enabled'
    persist()
    run(COMPOSE + ['stop', 'scheduler', 'notification-worker'])
    dump = backup / 'database.dump'
    with dump.open('wb') as output:
        run(['docker', 'exec', DB, 'pg_dump', '-U', db_env['POSTGRES_USER'], '-d', db_env['POSTGRES_DB'], '-Fc'], stdout=output)
    os.chmod(dump, 0o600)
    assert dump.stat().st_size > 10000
    with dump.open('rb') as input_file:
        run(['docker', 'exec', '-i', DB, 'pg_restore', '--list'], stdin=input_file, stdout=subprocess.DEVNULL)
    record.update({'stage': 'backup_verified', 'backup_bytes': dump.stat().st_size, 'backup_sha256': hashlib.file_digest(dump.open('rb'), 'sha256').hexdigest()})
    persist()
    run(['docker', 'tag', candidate_migrator, 'telegram-migrate:production'])
    run(COMPOSE + ['run', '--rm', '--no-deps', 'migrate'])
    after = set(sql('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL').splitlines())
    assert after == manifest
    for table in ['WebCart', 'WebCartItem', 'WebCartMutation']:
        assert sql('SELECT to_regclass(\'"' + table + '"\') IS NOT NULL') == 't'
    updated = original
    for key, value in changes.items():
        pattern = '^' + re.escape(key) + '=.*$'
        if re.search(pattern, updated, re.M):
            updated = re.sub(pattern, lambda match, line=key+'='+value: line, updated, flags=re.M)
        else:
            updated = updated.rstrip() + '\n' + key + '=' + value + '\n'
    temporary = BASE / '.env.clerk-stage'
    temporary.write_text(updated)
    os.chmod(temporary, 0o600)
    temporary.replace(env_path)
    run(['docker', 'tag', candidate, 'telegram-app:production'])
    replaced = True
    run(COMPOSE + ['up', '-d', '--no-deps', 'app'])
    health()
    assert inspect(DB)['Id'] == db['Id'] and inspect(DB)['Mounts'] == db['Mounts']
    smoke = node("""
import {createHash,createHmac,randomUUID} from 'node:crypto';
const signed = path => {const timestamp=String(Date.now()),id=randomUUID(); return {'x-storefront-key-id':process.env.STOREFRONT_API_KEY_ID,'x-storefront-timestamp':timestamp,'x-storefront-request-id':id,'x-storefront-signature':createHmac('sha256',process.env.STOREFRONT_API_SHARED_SECRET).update([timestamp,id,'GET',path,createHash('sha256').update('').digest('hex')].join('.')).digest('hex')};};
const request = (path,headers={})=>fetch('http://127.0.0.1:3000'+path,{headers});
const catalogPath='/api/storefront/v1/catalog',headers=signed(catalogPath);
const unsigned=await request(catalogPath);
const catalog=await request(catalogPath,headers);const data=await catalog.json();
const replay=await request(catalogPath,headers);
const cart=await request('/api/storefront/v1/cart',signed('/api/storefront/v1/cart'));
const invalid=await request('/api/storefront/v1/account',{...signed('/api/storefront/v1/account'),authorization:'Bearer clerk:invalid'});
const health=await request('/api/health');
console.log(JSON.stringify({health:health.status,unsigned:unsigned.status,catalog:catalog.status,products:data.products?.length,replay:replay.status,cart:cart.status,invalid_identity:invalid.status,clerk_enabled:process.env.STOREFRONT_CLERK_ENABLED==='true'}));
""")
    assert smoke['health'] == 200 and smoke['unsigned'] == 401 and smoke['catalog'] == 200
    assert smoke['replay'] == 409 and smoke['cart'] == 401 and smoke['invalid_identity'] == 401
    assert smoke['products'] > 0 and smoke['clerk_enabled']
    run(COMPOSE + ['start', 'scheduler', 'notification-worker'])
    for service in ['telegram-store-scheduler-1', 'telegram-store-notification-worker-1']:
        assert inspect(service)['State']['Running']
    record.update({'stage': 'backend_ready_under_maintenance', 'applied_migrations': len(after), 'app_image': candidate, 'migrator_image': candidate_migrator, 'smoke': smoke})
    persist()
    print(json.dumps(record), flush=True)
except Exception as error:
    record.update({'stage': 'failed', 'error_type': type(error).__name__, 'maintenance_enabled': maintenance_started})
    persist()
    if replaced:
        run(['docker', 'tag', old_app['Image'], 'telegram-app:production'])
        run(COMPOSE + ['up', '-d', '--no-deps', 'app'])
        health()
    if maintenance_started:
        run(COMPOSE + ['start', 'scheduler', 'notification-worker'])
    # Preserve additive schema and Clerk configuration. Never silently reopen on failure.
    raise
