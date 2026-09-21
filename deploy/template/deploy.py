"""Configure once, build remotely over SSH or Freestyle. Python standard library."""
import argparse, datetime, json, re, shlex, subprocess, tarfile, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
def run(args):
    subprocess.run(args, check=True)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['init', 'set', 'plan', 'deploy', 'status'])
    p.add_argument('--profile', default='deploy/template/profile.local.json')
    p.add_argument('--key')
    p.add_argument('--value')
    p.add_argument('--env-file')
    a = p.parse_args()
    path = Path(a.profile)
    if a.action == 'init':
        if path.exists():
            raise SystemExit('Profile already exists')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({'transport': 'ssh', 'host': 'ubuntu@example.com', 'identity': '', 'vm': '', 'team': '', 'domain': '', 'remote_dir': '/home/ubuntu/storefront'}, indent=2))
        return
    cfg = json.loads(path.read_text())
    cfg.setdefault('domain', '')
    if a.action == 'set':
        assert a.key in cfg, 'Unknown setting'
        cfg[a.key] = a.value
        path.write_text(json.dumps(cfg, indent=2))
        return
    assert cfg['transport'] in ['ssh', 'freestyle']
    assert not cfg['domain'] or re.fullmatch(r'[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?', cfg['domain']), 'Use a hostname without protocol or path'
    base = cfg['remote_dir']
    assert re.fullmatch(r'/home/[a-zA-Z0-9_-]+/[a-zA-Z0-9_/-]+', base) and '..' not in base
    assert '70.153.137.10' not in cfg['host'], 'Use a separate storefront VM'
    freestyle = ['npx', 'freestyle@latest']
    if __import__('os').name == 'nt':
        freestyle[0] = 'npx.cmd'
    ssh = ['ssh'] + (['-i', cfg['identity']] if cfg['identity'] else [])
    def execute(command):
        if cfg['transport'] == 'freestyle':
            run(freestyle + ['vm', 'exec', cfg['vm'], '--team', cfg['team'], '--', 'bash', '-lc', command])
        else:
            run(ssh + [cfg['host'], command])
    def upload(source, target):
        if cfg['transport'] == 'freestyle':
            run(freestyle + ['vm', 'fs', 'write', cfg['vm'], target, str(source), '--team', cfg['team']])
        else:
            run(['scp'] + (['-i', cfg['identity']] if cfg['identity'] else []) + [str(source), cfg['host'] + ':' + target])
    if a.action == 'plan':
        print(json.dumps(cfg, indent=2)); return
    if a.action == 'status':
        execute('cat ' + shlex.quote(base + '/deployment-status.json')); return
    release = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
    execute('mkdir -p ' + shlex.quote(base) + ' && chmod 700 ' + shlex.quote(base))
    if a.env_file:
        upload(Path(a.env_file).resolve(), base + '/.env.production')
    with tempfile.TemporaryDirectory() as tmp:
        settings = Path(tmp) / 'settings.json'
        settings.write_text(json.dumps({'domain': cfg['domain']}))
        upload(settings, base + '/settings.json')
        archive = Path(tmp) / 'source.tar.gz'
        with tarfile.open(archive, 'w:gz') as bundle:
            for item in ['src', 'public', 'tests', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'next-env.d.ts', 'eslint.config.mjs', 'Dockerfile', '.dockerignore']:
                source = ROOT / 'storefront' / item
                def safe(info):
                    if info.issym() or info.islnk() or any(part.startswith('.env') for part in Path(info.name).parts):
                        raise ValueError('Unsafe archive entry')
                    return info
                if source.exists():
                    bundle.add(source, arcname=item, filter=safe)
        upload(archive, base + '/source.tar.gz')
    upload(Path(__file__).with_name('remote.py'), base + '/remote.py')
    execute('python3 ' + shlex.quote(base + '/remote.py') + ' ' + shlex.quote(base) + ' ' + release + ' --background')

if __name__ == '__main__':
    main()
