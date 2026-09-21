"""Promote the verified frontend image; restore the previous image on failure."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time
import urllib.error
import urllib.request

base = Path('/opt/telegram-storefront-freestyle')
compose = ['docker', 'compose', '-f', str(base / 'docker-compose.yml')]
container = 'telegram-storefront-freestyle-app-1'
alias = 'telegram-storefront:freestyle-test'
candidate = 'storefront-ui-candidate'

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]

def healthy():
    for attempt in range(30):
        if inspect(container)['State'].get('Health', {}).get('Status') == 'healthy':
            return
        time.sleep(2)
    raise RuntimeError('Frontend health check failed')

def public_probe(path, expected=200, method='GET'):
    req = urllib.request.Request('https://bwr-tele-a6fa78d4.style.dev' + path,
                                 data=b'{}' if method == 'POST' else None,
                                 method=method, headers={'Content-Type': 'application/json'})
    try:
        response = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read().decode()
        assert response.status == expected, f'{path}: unexpected status'
        return body

state = json.loads((base / 'ui-build-state.json').read_text())
assert state['status'] == 'candidate_verified'
assert inspect(candidate)['State']['Health']['Status'] == 'healthy'
old = inspect(container)['Image']
new = inspect(candidate)['Image']
env_hash = hashlib.sha256((base / '.env.production').read_bytes()).hexdigest()
backup = base / 'backups/20260915-ui-fixes'
backup.mkdir(mode=0o700, parents=True, exist_ok=False)
shutil.copy2(base / 'docker-compose.yml', backup / 'docker-compose.yml')
(backup / 'images.json').write_text(json.dumps({'previous': old, 'candidate': new}))
run(['docker', 'tag', old, 'telegram-storefront:pre-ui-20260915'])
try:
    run(['docker', 'tag', new, alias])
    run(compose + ['up', '-d', '--no-deps', 'app'])
    healthy()
    assert 'Versi uji' in public_probe('/shop')
    assert json.loads(public_probe('/api/health'))['ok'] is True
    assert json.loads(public_probe('/api/checkout', 503, 'POST'))['code'] == 'preview_read_only'
    assert 'Halaman belum ditemukan.' in public_probe('/products/audit-missing-product', 404)
    assert hashlib.sha256((base / '.env.production').read_bytes()).hexdigest() == env_hash
    assert inspect(container)['Image'] == new
    result = {'status': 'deployed', 'image': new, 'rollback': 'telegram-storefront:pre-ui-20260915',
              'health': 'healthy', 'checkout_locked': True, 'runtime_env_unchanged': True}
    (base / 'ui-deploy-state.json').write_text(json.dumps(result))
    print(json.dumps(result), flush=True)
except Exception as error:
    run(['docker', 'tag', old, alias])
    run(compose + ['up', '-d', '--no-deps', 'app'])
    healthy()
    (base / 'ui-deploy-state.json').write_text(json.dumps({'status': 'rolled_back', 'error_type': type(error).__name__}))
    raise SystemExit('Frontend rolled back after failed verification')
finally:
    run(['docker', 'rm', '-f', candidate], stdout=subprocess.DEVNULL)
