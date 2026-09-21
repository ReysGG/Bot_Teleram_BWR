"""Switch only the Freestyle storefront's APP_URL after custom HTTPS is working."""
from pathlib import Path
import json
import os
import re
import subprocess
import time
import urllib.request

base = Path('/opt/telegram-storefront-freestyle')
url = 'https://store.buildwithreys.com'
with urllib.request.urlopen(url + '/api/health', timeout=30) as response:
    assert response.status == 200 and json.load(response)['ok'] is True
env_file = base / '.env.production'
original = env_file.read_text()
assert re.search(r'^STOREFRONT_PREVIEW_READ_ONLY=[\"\']?true[\"\']?$', original, re.M)
assert re.search(r'^STOREFRONT_CLERK_COMMERCE_ENABLED=[\"\']?false[\"\']?$', original, re.M)
assert len(re.findall(r'^APP_URL=', original, re.M)) == 1
backup = base / 'backups/20260915-custom-domain'
backup.mkdir(mode=0o700, parents=True, exist_ok=False)
(backup / '.env.production').write_text(original)
os.chmod(backup / '.env.production', 0o600)
compose = ['docker', 'compose', '-f', str(base / 'docker-compose.yml'), 'up', '-d', '--no-deps', 'app']

def write_env(content):
    temporary = base / '.env.domain-stage'
    temporary.write_text(content)
    os.chmod(temporary, 0o600)
    temporary.replace(env_file)

def check_health():
    for attempt in range(30):
        state = json.loads(subprocess.check_output(['docker', 'inspect', 'telegram-storefront-freestyle-app-1']))[0]
        if state['State'].get('Health', {}).get('Status') == 'healthy':
            return
        time.sleep(2)
    raise RuntimeError('Frontend health did not recover')

try:
    write_env(re.sub(r'^APP_URL=.*$', 'APP_URL=' + url, original, flags=re.M))
    subprocess.run(compose, check=True)
    check_health()
    with urllib.request.urlopen(url + '/api/health', timeout=30) as response:
        assert response.status == 200 and json.load(response)['ok'] is True
    print(json.dumps({'app_url': url, 'healthy': True, 'checkout_locked': True, 'changed_keys': ['APP_URL']}))
except Exception:
    write_env(original)
    subprocess.run(compose, check=True)
    check_health()
    raise SystemExit('Domain configuration rolled back')
