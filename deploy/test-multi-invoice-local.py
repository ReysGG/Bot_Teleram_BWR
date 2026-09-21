"""Test on the local workstation, using an isolated disposable PostgreSQL."""
import binascii, gzip, hashlib, json, os, subprocess, sys, tarfile, time
from pathlib import Path
base = Path.home()/'.codex'/'build-cache'/'telegram-multi-invoice-tests-r3'
base.mkdir(parents=True,exist_ok=True)
state = base / 'state.json'
def run(args, **kwargs): return subprocess.run(args, check=True, **kwargs)
if '--background' in sys.argv:
    with (base / 'build.log').open('w') as log:
        subprocess.Popen([sys.executable, __file__], stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    print('Isolated multi-invoice tests and backend build started'); sys.exit(0)
network = 'multi-invoice-review-isolated-20260917'
database = 'multi-invoice-review-db-20260917'
created_net = False
created_db = False
try:
    state.write_text(json.dumps({'status': 'testing'}))
    source = base / 'source'; source.mkdir(exist_ok=False)
    archive = Path('C:\\Users\\David Boy\\Documents\\NextJS\\telegram\\deploy\\multi-invoice-source.tar.gz')
    manifest = json.loads(Path('C:\\Users\\David Boy\\Documents\\NextJS\\telegram\\deploy\\multi-invoice-release-manifest.json').read_text())
    assert hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest() == manifest['sha256']
    with tarfile.open(archive) as bundle: bundle.extractall(source, filter='data')
    run(['docker', 'build', '--target', 'deps', '-t', 'telegram-multi-invoice-deps:20260917', str(source)])
    (source / 'Dockerfile.multi-invoice-test').write_text('FROM telegram-multi-invoice-deps:20260917\nCOPY . .\nRUN npx --no-install prisma generate\nCMD ["sh", "-c", "npx --no-install prisma migrate deploy && npx --no-install vitest run tests/invoice-payment-success.test.ts tests/invoice-message-owner.test.ts tests/invoice-document-delivery.test.ts tests/telegram-navigation-entities.test.ts tests/pending-order-cancel-db.test.ts tests/payment-idempotency.test.ts tests/storefront-web-order-db.test.ts tests/web-delivery-bundle.test.ts tests/storefront-product-guidance.test.ts tests/web-success-announcement.test.ts tests/web-success-worker.test.ts tests/completion-caption-worker.test.ts tests/product-post-delivery.test.ts tests/telegram-completion-ux.test.ts tests/success-channel.test.ts"]\n')
    run(['docker', 'build', '-f', str(source / 'Dockerfile.multi-invoice-test'), '-t', 'telegram-multi-invoice-tests:20260917', str(source)])
    run(['docker', 'network', 'create', '--internal', network], stdout=subprocess.DEVNULL); created_net = True
    run(['docker', 'run', '-d', '--name', database, '--network', network, '--memory', '512m', '--tmpfs', '/var/lib/postgresql/data:rw,size=256m', '-e', 'POSTGRES_USER=multi-invoicetest', '-e', 'POSTGRES_PASSWORD=disposable-only', '-e', 'POSTGRES_DB=multi-invoice_disposable', 'postgres:17-alpine'], stdout=subprocess.DEVNULL); created_db = True
    for attempt in range(30):
        if subprocess.run(['docker', 'exec', database, 'pg_isready', '-U', 'multi-invoicetest'], capture_output=True).returncode == 0: break
        time.sleep(1)
    else: raise RuntimeError('Disposable DB not ready')
    url = 'postgresql://multi-invoicetest:disposable-only@' + database + ':5432/multi-invoice_disposable'
    body = '0002010102115204000053033605802ID5908K12 TEST6007JAKARTA6304'
    fixture = body + format(binascii.crc_hqx(body.encode(), 0xffff), '04X')
    env = {**os.environ, 'DATABASE_URL': url, 'DIRECT_URL': url, 'RUN_DB_TESTS': '1', 'DIGITAL_STOCK_ENCRYPTION_KEY': '11'*32, 'STOREFRONT_CONTACT_LOOKUP_SECRET': 'disposable-multi-invoice-lookup-'+'x'*40, 'AUTH_SECRET': 'disposable-multi-invoice-auth-'+'x'*40, 'PAYMENT_QRIS_BASE_PAYLOAD': fixture, 'APP_URL': 'http://localhost:3000', 'STOREFRONT_CLERK_ENABLED': 'false'}
    args = ['docker', 'run', '--rm', '--network', network, '--memory', '1536m']
    for key in ['DATABASE_URL','DIRECT_URL','RUN_DB_TESTS','DIGITAL_STOCK_ENCRYPTION_KEY','STOREFRONT_CONTACT_LOOKUP_SECRET','AUTH_SECRET','PAYMENT_QRIS_BASE_PAYLOAD','APP_URL','STOREFRONT_CLERK_ENABLED']: args += ['-e', key]
    run(args + ['telegram-multi-invoice-tests:20260917'], env=env)
    (base / 'integration-passed.json').write_text(json.dumps({'passed': True, 'database': 'disposable-only', 'network': 'internal-only'}))
    print('LOCAL_DISPOSABLE_TESTS_PASSED', flush=True)
except Exception as error:
    state.write_text(json.dumps({'status': 'failed', 'error': type(error).__name__})); raise
finally:
    if created_db: subprocess.run(['docker','rm','-f',database], check=False, stdout=subprocess.DEVNULL)
    if created_net: subprocess.run(['docker','network','rm',network], check=False, stdout=subprocess.DEVNULL)
