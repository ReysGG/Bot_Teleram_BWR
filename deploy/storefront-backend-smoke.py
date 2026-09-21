"""Exercise the built backend on disposable containers, never the live database."""
from pathlib import Path
import hashlib
import hmac
import json
import subprocess
import time
import urllib.error
import urllib.request
import uuid

base = Path('/opt/telegram-storefront-freestyle/commerce-build-20260915')
network = 'storefront-activation-disposable-net'
database = 'storefront-activation-disposable-db'
app = 'storefront-activation-disposable-app'
secret = 'disposable-service-signing-secret-20260915'
url = 'postgresql://webtest:disposable-only@' + database + ':5432/cart_disposable_vm'
created = []

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def get(path, headers=None):
    try:
        response = urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:3005' + path, headers=headers or {}), timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.load(response)

def signed(path):
    stamp = str(int(time.time() * 1000))
    request_id = str(uuid.uuid4())
    canonical = '.'.join([stamp, request_id, 'GET', path, hashlib.sha256(b'').hexdigest()])
    return {'x-storefront-key-id': 'disposable', 'x-storefront-request-id': request_id,
            'x-storefront-timestamp': stamp, 'x-storefront-signature': hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()}

try:
    assert json.loads((base / 'state.json').read_text())['status'] == 'built'
    run(['docker', 'network', 'create', network], stdout=subprocess.DEVNULL)
    run(['docker', 'run', '-d', '--name', database, '--network', network, '--memory', '256m',
         '-e', 'POSTGRES_USER=webtest', '-e', 'POSTGRES_PASSWORD=disposable-only',
         '-e', 'POSTGRES_DB=cart_disposable_vm', 'postgres:17-alpine'], stdout=subprocess.DEVNULL)
    created.append(database)
    for attempt in range(30):
        result = subprocess.run(['docker', 'exec', database, 'pg_isready', '-U', 'webtest'], capture_output=True)
        if result.returncode == 0:
            break
        time.sleep(2)
    run(['docker', 'run', '--rm', '--network', network, '--memory', '384m',
         '-e', 'DATABASE_URL=' + url, '-e', 'DIRECT_URL=' + url,
         'telegram-migrate:clerk-candidate-20260915'])
    run(['docker', 'run', '-d', '--name', app, '--network', network, '--memory', '512m',
         '-p', '127.0.0.1:3005:3000', '-e', 'DATABASE_URL=' + url,
         '-e', 'APP_URL=http://localhost:3005', '-e', 'STOREFRONT_API_KEY_ID=disposable',
         '-e', 'STOREFRONT_API_SHARED_SECRET=' + secret, '-e', 'STOREFRONT_CLERK_ENABLED=true',
         '-e', 'STOREFRONT_CLERK_ISSUER=https://clerk.store.buildwithreys.com',
         '-e', 'STOREFRONT_CLERK_AUTHORIZED_PARTIES=https://store.buildwithreys.com',
         '-e', 'STOREFRONT_CLERK_JWT_KEY=disposable-invalid-key',
         'telegram-app:clerk-candidate-20260915'], stdout=subprocess.DEVNULL)
    created.append(app)
    for attempt in range(30):
        try:
            assert get('/api/health')[0] == 200
            break
        except Exception:
            if attempt == 29:
                raise
            time.sleep(2)
    path = '/api/storefront/v1/catalog'
    assert get(path)[0] == 401
    headers = signed(path)
    assert get(path, headers)[0] == 200
    assert get(path, headers)[0] == 409
    path = '/api/storefront/v1/cart'
    status, body = get(path, signed(path))
    assert status == 401 and body['code'] == 'sign_in_required'
    (base / 'smoke.json').write_text(json.dumps({'passed': True, 'isolated_migrations': 48, 'health': 200, 'unsigned': 401, 'signed_catalog': 200, 'replay': 409, 'cart_requires_identity': 401}))
    print('Backend runtime smoke passed against disposable database.', flush=True)
except Exception:
    if app in created:
        with (base / 'smoke-app.log').open('w') as log:
            subprocess.run(['docker', 'logs', '--tail', '30', app], stdout=log, stderr=log)
    raise
finally:
    for name in reversed(created):
        subprocess.run(['docker', 'rm', '-f', name], check=False, stdout=subprocess.DEVNULL)
    subprocess.run(['docker', 'network', 'rm', network], check=False, stdout=subprocess.DEVNULL)
