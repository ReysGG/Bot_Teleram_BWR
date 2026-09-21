"""Build and smoke-test only the separate Freestyle storefront. No Azure access."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import time
import urllib.error
import urllib.request

BASE = Path('/opt/telegram-storefront-freestyle')
RELEASE = BASE / 'releases/20260915-ui-fixes'
STATE = BASE / 'ui-build-state.json'
IMAGE = 'telegram-storefront:ui-20260915'
CANDIDATE = 'storefront-ui-candidate'

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def probe(path, expected=200, method='GET'):
    req = urllib.request.Request('http://127.0.0.1:3002' + path,
                                 data=b'{}' if method == 'POST' else None,
                                 method=method,
                                 headers={'Content-Type': 'application/json'})
    try:
        response = urllib.request.urlopen(req, timeout=25)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read().decode()
        if response.status != expected:
            raise RuntimeError(f'{path}: unexpected HTTP {response.status}')
        print(f'Smoke {method} {path}: HTTP {response.status}', flush=True)
        return body

try:
    STATE.write_text(json.dumps({'status': 'building'}))
    archive = Path('/tmp/storefront-ui-20260915.tar.gz')
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == '2bd506fd84bc941b9071d256ca3c496ee0585692992c07d234ae634e61424827'
    RELEASE.mkdir(parents=True, exist_ok=False)
    with tarfile.open(archive) as bundle:
        bundle.extractall(RELEASE, filter='data')
    values = {}
    for line in (BASE / '.env.production').read_text().splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            values[key] = value.strip().strip('"').strip("'")
    assert values.get('STOREFRONT_PREVIEW_READ_ONLY') == 'true'
    assert values.get('STOREFRONT_CLERK_COMMERCE_ENABLED') == 'false'
    env = os.environ.copy()
    for key in ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'NEXT_PUBLIC_TELEGRAM_BOT_USERNAME']:
        env[key] = values.get(key, '')
    run(['docker', 'build', '--progress=plain', '--build-arg', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
         '--build-arg', 'NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', '-t', IMAGE, str(RELEASE)], env=env)
    run(['docker', 'run', '-d', '--name', CANDIDATE, '--env-file', str(BASE / '.env.production'),
         '--memory', '512m', '-p', '127.0.0.1:3002:3000', IMAGE], stdout=subprocess.DEVNULL)
    for attempt in range(30):
        try:
            probe('/api/health')
            break
        except Exception:
            if attempt == 29:
                raise
            time.sleep(2)
    for path in ['/', '/shop', '/categories', '/sign-in', '/sign-up', '/cart', '/orders',
                 '/products/chatgpt-business-1-bulan-mt6n305e']:
        assert 'Versi uji' in probe(path), f'Preview notice missing on {path}'
    category = probe('/shop?category=claude-api&sort=price-low')
    assert 'Claude API' in category and 'name="category"' in category
    assert 'Halaman belum ditemukan.' in probe('/products/audit-missing-product', 404)
    assert 'Lanjut pantau di Telegram.' not in probe('/checkout/success')
    for path in ['/api/checkout', '/api/cart', '/api/customer/account']:
        assert json.loads(probe(path, 503, 'POST'))['code'] == 'preview_read_only'
    STATE.write_text(json.dumps({'status': 'candidate_verified', 'image': IMAGE, 'release': str(RELEASE)}))
    print('Candidate passed. Public container has not been replaced.', flush=True)
except Exception as error:
    STATE.write_text(json.dumps({'status': 'failed', 'error_type': type(error).__name__}))
    print('Build or smoke check failed:', type(error).__name__, flush=True)
    raise SystemExit(1)
