"""Build and test only on the build VM, using an isolated disposable PostgreSQL."""
import binascii, gzip, hashlib, json, os, subprocess, sys, tarfile, time
from pathlib import Path
base = Path('/home/ubuntu/claim-release-20260916')
base.mkdir(exist_ok=True)
state = base / 'state.json'
def run(args, **kwargs): return subprocess.run(args, check=True, **kwargs)
if '--background' in sys.argv:
    with (base / 'build.log').open('w') as log:
        subprocess.Popen([sys.executable, __file__], stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    print('Isolated claim tests and backend build started'); sys.exit(0)
network = 'claim-review-isolated-20260916'
database = 'claim-review-db-20260916'
created_net = False
created_db = False
try:
    state.write_text(json.dumps({'status': 'testing'}))
    source = base / 'source'; source.mkdir(exist_ok=False)
    archive = Path('/home/ubuntu/claim-release-source.tar.gz')
    manifest = json.loads(Path('/home/ubuntu/claim-release-manifest.json').read_text())
    assert hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest() == manifest['sha256']
    with tarfile.open(archive) as bundle: bundle.extractall(source, filter='data')
    run(['docker', 'build', '--target', 'deps', '-t', 'telegram-claim-deps:20260916', str(source)])
    (source / 'Dockerfile.claim-test').write_text('FROM telegram-claim-deps:20260916\nCOPY . .\nRUN npx --no-install prisma generate\nCMD ["sh", "-c", "npx --no-install prisma migrate deploy && npx --no-install vitest run tests/storefront-web-order-db.test.ts tests/storefront-product-guidance.test.ts"]\n')
    run(['docker', 'build', '-f', str(source / 'Dockerfile.claim-test'), '-t', 'telegram-claim-tests:20260916', str(source)])
    run(['docker', 'network', 'create', '--internal', network], stdout=subprocess.DEVNULL); created_net = True
    run(['docker', 'run', '-d', '--name', database, '--network', network, '--memory', '512m', '--tmpfs', '/var/lib/postgresql/data:rw,size=256m', '-e', 'POSTGRES_USER=claimtest', '-e', 'POSTGRES_PASSWORD=disposable-only', '-e', 'POSTGRES_DB=claim_disposable', 'postgres:17-alpine'], stdout=subprocess.DEVNULL); created_db = True
    for attempt in range(30):
        if subprocess.run(['docker', 'exec', database, 'pg_isready', '-U', 'claimtest'], capture_output=True).returncode == 0: break
        time.sleep(1)
    else: raise RuntimeError('Disposable DB not ready')
    url = 'postgresql://claimtest:disposable-only@' + database + ':5432/claim_disposable'
    body = '0002010102115204000053033605802ID5908K12 TEST6007JAKARTA6304'
    fixture = body + format(binascii.crc_hqx(body.encode(), 0xffff), '04X')
    env = {**os.environ, 'DATABASE_URL': url, 'DIRECT_URL': url, 'RUN_DB_TESTS': '1', 'DIGITAL_STOCK_ENCRYPTION_KEY': '11'*32, 'STOREFRONT_CONTACT_LOOKUP_SECRET': 'disposable-claim-lookup-'+'x'*40, 'AUTH_SECRET': 'disposable-claim-auth-'+'x'*40, 'PAYMENT_QRIS_BASE_PAYLOAD': fixture, 'APP_URL': 'http://localhost:3000', 'STOREFRONT_CLERK_ENABLED': 'false'}
    args = ['docker', 'run', '--rm', '--network', network, '--memory', '1536m']
    for key in ['DATABASE_URL','DIRECT_URL','RUN_DB_TESTS','DIGITAL_STOCK_ENCRYPTION_KEY','STOREFRONT_CONTACT_LOOKUP_SECRET','AUTH_SECRET','PAYMENT_QRIS_BASE_PAYLOAD','APP_URL','STOREFRONT_CLERK_ENABLED']: args += ['-e', key]
    run(args + ['telegram-claim-tests:20260916'], env=env)
    (base / 'integration-passed.json').write_text(json.dumps({'passed': True, 'database': 'disposable-only', 'network': 'internal-only'}))
    state.write_text(json.dumps({'status': 'building', 'integration': 'passed'}))
    # The runtime image excludes test-only fixtures, as normal backend releases do.
    with (source / '.dockerignore').open('a') as f: f.write('\ntests/\nDockerfile.claim-test\n')
    run(['docker', 'build', '--target', 'runner', '-t', 'telegram-app:claim-20260916', str(source)])
    out = base / 'backend-image.tar.gz'
    with gzip.open(out, 'wb', compresslevel=1) as output:
        proc = subprocess.Popen(['docker', 'save', 'telegram-app:claim-20260916'], stdout=subprocess.PIPE)
        while chunk := proc.stdout.read(1024*1024): output.write(chunk)
        assert proc.wait() == 0
    state.write_text(json.dumps({'status': 'built', 'integration': 'passed', 'sha256': hashlib.file_digest(out.open('rb'), 'sha256').hexdigest(), 'bytes': out.stat().st_size}))
except Exception as error:
    state.write_text(json.dumps({'status': 'failed', 'error': type(error).__name__})); raise
finally:
    if created_db: subprocess.run(['docker','rm','-f',database], check=False, stdout=subprocess.DEVNULL)
    if created_net: subprocess.run(['docker','network','rm',network], check=False, stdout=subprocess.DEVNULL)
