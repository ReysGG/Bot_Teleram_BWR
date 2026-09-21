"""Remote storefront release runner. No database access or migrations."""
import fcntl, json, os, re, subprocess, sys, tarfile, time
from pathlib import Path

def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def healthy(name):
    for _ in range(60):
        state = json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]['State']
        if state.get('Health', {}).get('Status') == 'healthy':
            return
        time.sleep(2)
    raise RuntimeError('Container health check failed')

def main():
    base = Path(sys.argv[1]).resolve()
    release = sys.argv[2]
    assert re.fullmatch(r'[a-z0-9-]+', release)
    base.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = (base / 'deployment.lock').open('w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    envfile = base / '.env.production'
    assert envfile.is_file(), 'Upload private runtime environment first'
    os.chmod(envfile, 0o600)
    folder = base / 'releases' / release
    folder.mkdir(parents=True, exist_ok=False)
    with tarfile.open(base / 'source.tar.gz') as bundle:
        bundle.extractall(folder, filter='data')
    values = {}
    for line in envfile.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            values[key] = value.strip().strip('\"').strip("'")
    for key in values:
        assert re.fullmatch(r'[A-Z][A-Z0-9_]*', key), 'Invalid environment key'
    settings = base / 'settings.json'
    domain = json.loads(settings.read_text()).get('domain') if settings.exists() else None
    if domain:
        assert re.fullmatch(r'[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?', domain)
        values['APP_URL'] = 'https://' + domain
    assert values.get('APP_URL', '').startswith('https://'), 'APP_URL must use HTTPS'
    image = 'storefront-release:' + release
    args = ['docker', 'build', '--target', 'runner', '-t', image]
    env = os.environ.copy()
    for key in ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'NEXT_PUBLIC_TELEGRAM_BOT_USERNAME']:
        assert values.get(key), 'Missing public build setting: ' + key
        env[key] = values[key]
        args += ['--build-arg', key]
    run(*args, str(folder), env=env)
    name = 'storefront-template'
    candidate = name + '-candidate'
    # Docker reads runtime values from process environment, never command arguments.
    def create(container, port=None):
        command = ['docker', 'create', '--name', container, '--restart', 'unless-stopped']
        if port:
            command += ['-p', port + ':3000']
        for key in values:
            assert re.fullmatch(r'[A-Z][A-Z0-9_]*', key)
            command += ['--env', key]
        run(*command, image, env={**os.environ, **values}, stdout=subprocess.DEVNULL)
        run('docker', 'start', container, stdout=subprocess.DEVNULL)
    create(candidate)
    try:
        healthy(candidate)
    finally:
        run('docker', 'rm', '-f', candidate, stdout=subprocess.DEVNULL)
    old = subprocess.run(['docker', 'inspect', name], capture_output=True)
    previous = name + '-previous-' + release
    if old.returncode == 0:
        run('docker', 'stop', name)
        run('docker', 'rename', name, previous)
    try:
        create(name, '3000')
        healthy(name)
    except Exception:
        subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL)
        if old.returncode == 0:
            run('docker', 'rename', previous, name)
            run('docker', 'start', name)
        raise
    (base / 'current.json').write_text(json.dumps({'release': release, 'image': image, 'previous': previous if old.returncode == 0 else None}))
    print('DEPLOYMENT_HEALTHY ' + release)

if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[3] == '--background':
        base = Path(sys.argv[1])
        with (base / 'deployment.log').open('w') as log:
            subprocess.Popen([sys.executable, __file__, sys.argv[1], sys.argv[2]], stdout=log, stderr=log, stdin=subprocess.DEVNULL, start_new_session=True)
        print('Build started. Check deployment.log and deployment-status.json on the VM.')
    else:
        state = Path(sys.argv[1]) / 'deployment-status.json'
        state.write_text(json.dumps({'status': 'building', 'release': sys.argv[2]}))
        try:
            main()
            state.write_text(json.dumps({'status': 'healthy', 'release': sys.argv[2]}))
        except Exception as error:
            state.write_text(json.dumps({'status': 'failed', 'release': sys.argv[2], 'error': type(error).__name__}))
            raise
