"""Activate the verified production-auth image; open writes only in a separate step."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

base = Path('/opt/telegram-storefront-freestyle')
private = base / 'private-activation-20260915'
container = 'telegram-storefront-freestyle-app-1'
compose = ['docker', 'compose', '-f', str(base / 'docker-compose.yml')]
mode = sys.argv[1] if len(sys.argv) > 1 else 'stage'
assert mode in ['stage', 'open']

def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]

def health():
    for attempt in range(35):
        if inspect(container)['State'].get('Health', {}).get('Status') == 'healthy':
            return
        time.sleep(2)
    raise RuntimeError('Frontend health timeout')

def parse(text):
    return {key.strip(): value.strip().strip('"').strip("'") for line in text.splitlines()
            if '=' in line and not line.lstrip().startswith('#') for key, value in [line.split('=', 1)]}

def probe(path, post=False):
    req = urllib.request.Request('https://store.buildwithreys.com' + path, data=b'{}' if post else None,
                                 headers={'Content-Type': 'application/json', 'Origin': 'https://store.buildwithreys.com'})
    try:
        response = urllib.request.urlopen(req, timeout=25)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.read().decode()

assert json.loads((base / 'clerk-frontend-build-state.json').read_text())['status'] == 'candidate_verified'
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = base / 'backups' / ('clerk-' + mode + '-' + stamp)
backup.mkdir(mode=0o700, parents=True, exist_ok=False)
env_path = base / '.env.production'
original = env_path.read_text()
current = parse(original)
assert current['APP_URL'] == 'https://store.buildwithreys.com'
shutil.copy2(env_path, backup / '.env.production')
os.chmod(backup / '.env.production', 0o600)
old_image = inspect(container)['Image']
rollback = 'telegram-storefront:rollback-clerk-' + mode + '-' + stamp
subprocess.run(['docker', 'tag', old_image, rollback], check=True)
if mode == 'stage':
    # Verify a trusted issuer endpoint before replacing the working login surface.
    with urllib.request.urlopen('https://clerk.store.buildwithreys.com/.well-known/jwks.json', timeout=25) as response:
        assert json.load(response).get('keys')
    keys = parse((private / '.env.clerk-production').read_text())
    assert keys['CLERK_SECRET_KEY'].startswith('sk_live_')
    assert keys['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'].startswith('pk_live_')
    changes = {key: keys[key] for key in ['CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY']}
    changes.update({'STOREFRONT_CLERK_COMMERCE_ENABLED': 'true', 'STOREFRONT_PREVIEW_READ_ONLY': 'true'})
else:
    assert current['STOREFRONT_CLERK_COMMERCE_ENABLED'] == 'true'
    assert current['CLERK_SECRET_KEY'].startswith('sk_live_')
    assert json.loads((base / 'clerk-activation-state.json').read_text())['stage'] == 'production_auth_ready_locked'
    changes = {'STOREFRONT_PREVIEW_READ_ONLY': 'false'}

try:
    updated = original
    for key, value in changes.items():
        pattern = '^' + re.escape(key) + '=.*$'
        if re.search(pattern, updated, re.M):
            updated = re.sub(pattern, lambda match, line=key+'='+value: line, updated, flags=re.M)
        else:
            updated = updated.rstrip() + '\n' + key + '=' + value + '\n'
    stage_file = base / '.env.clerk-stage'
    stage_file.write_text(updated)
    os.chmod(stage_file, 0o600)
    stage_file.replace(env_path)
    if mode == 'stage':
        subprocess.run(['docker', 'tag', 'telegram-storefront:clerk-candidate-20260915', 'telegram-storefront:freestyle-test'], check=True)
    subprocess.run(compose + ['up', '-d', '--no-deps', 'app'], check=True)
    health()
    for path in ['/api/health', '/shop', '/sign-in', '/cart']:
        assert probe(path)[0] == 200
    status, body = probe('/api/customer/account', True)
    if mode == 'stage':
        assert status == 503 and json.loads(body)['code'] == 'preview_read_only'
    else:
        assert status == 401 and json.loads(body)['code'] == 'sign_in_required'
        assert 'Versi uji' not in probe('/shop')[1]
    result = {'stage': 'production_auth_ready_locked' if mode == 'stage' else 'commerce_open',
              'image': inspect(container)['Image'], 'backup_directory': str(backup), 'rollback_image': rollback,
              'health': 'healthy', 'anonymous_account_status': status}
    (base / 'clerk-activation-state.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result), flush=True)
except Exception:
    env_path.write_text(original)
    os.chmod(env_path, 0o600)
    subprocess.run(['docker', 'tag', old_image, 'telegram-storefront:freestyle-test'], check=True)
    subprocess.run(compose + ['up', '-d', '--no-deps', 'app'], check=True)
    health()
    raise
