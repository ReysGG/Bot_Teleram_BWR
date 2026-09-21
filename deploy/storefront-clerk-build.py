"""Build the storefront with its production publishable key; keep writes locked."""
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

base = Path('/opt/telegram-storefront-freestyle')
private = base / 'private-activation-20260915'
state = base / 'clerk-frontend-build-state.json'

def parse(path):
    values = {}
    for line in path.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values

try:
    state.write_text(json.dumps({'status': 'building'}))
    key_file = private / '.env.clerk-production'
    os.chmod(key_file, 0o600)
    keys = parse(key_file)
    current = parse(base / '.env.production')
    assert keys['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'].startswith('pk_live_')
    assert keys['CLERK_SECRET_KEY'].startswith('sk_live_')
    assert current['STOREFRONT_PREVIEW_READ_ONLY'] == 'true'
    env = os.environ.copy()
    env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] = keys['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY']
    env['NEXT_PUBLIC_TELEGRAM_BOT_USERNAME'] = current['NEXT_PUBLIC_TELEGRAM_BOT_USERNAME']
    image = 'telegram-storefront:clerk-candidate-20260915'
    subprocess.run(['docker', 'build', '--progress=plain', '--build-arg', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
                    '--build-arg', 'NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', '-t', image,
                    str(base / 'releases/20260915-ui-fixes')], env=env, check=True)
    current.update({key: keys[key] for key in ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY']})
    current.update({'STOREFRONT_PREVIEW_READ_ONLY': 'true', 'STOREFRONT_CLERK_COMMERCE_ENABLED': 'false'})
    candidate_env = private / '.env.storefront-candidate'
    candidate_env.write_text('\n'.join(key + '=' + value for key, value in current.items()) + '\n')
    os.chmod(candidate_env, 0o600)
    subprocess.run(['docker', 'run', '-d', '--name', 'storefront-clerk-candidate', '--env-file', str(candidate_env),
                    '--memory', '512m', '-p', '127.0.0.1:3004:3000', image], check=True, stdout=subprocess.DEVNULL)
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3004/api/health', timeout=15) as response:
                assert json.load(response)['ok']
            break
        except Exception:
            if attempt == 29:
                raise
            time.sleep(2)
    for path in ['/shop', '/sign-in', '/sign-up', '/cart']:
        with urllib.request.urlopen('http://127.0.0.1:3004' + path, timeout=30) as response:
            assert response.status == 200
        print('Candidate HTTP 200:', path, flush=True)
    state.write_text(json.dumps({'status': 'candidate_verified', 'image': image, 'production_keys': True, 'checkout_locked': True}))
except Exception as error:
    state.write_text(json.dumps({'status': 'failed', 'error_type': type(error).__name__}))
    raise
