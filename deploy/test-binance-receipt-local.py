"""Test on the local workstation, using an isolated disposable PostgreSQL."""
import binascii, gzip, hashlib, json, os, subprocess, sys, tarfile, time
from pathlib import Path
base = Path.home()/'.codex'/'build-cache'/'telegram-binance-receipt-tests-r1'
base.mkdir(parents=True,exist_ok=True)
state = base / 'state.json'
def run(args, **kwargs): return subprocess.run(args, check=True, **kwargs)
if '--background' in sys.argv:
    with (base / 'build.log').open('w') as log:
        subprocess.Popen([sys.executable, __file__], stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    print('Isolated binance-receipt tests and backend build started'); sys.exit(0)
network = 'binance-receipt-review-isolated-20260918'
database = 'binance-receipt-review-db-20260918'
created_net = False
created_db = False
try:
    state.write_text(json.dumps({'status': 'testing'}))
    source = base / 'source'; source.mkdir(exist_ok=False)
    archive = Path('C:\\Users\\David Boy\\Documents\\NextJS\\telegram\\deploy\\binance-receipt-source.tar.gz')
    manifest = json.loads(Path('C:\\Users\\David Boy\\Documents\\NextJS\\telegram\\deploy\\binance-receipt-release-manifest.json').read_text())
    assert hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest() == manifest['sha256']
    with tarfile.open(archive) as bundle: bundle.extractall(source, filter='data')
    run(['docker', 'build', '--target', 'deps', '-t', 'telegram-binance-receipt-deps:20260918', str(source)])
    (source / 'Dockerfile.binance-receipt-test').write_text('FROM telegram-binance-receipt-deps:20260918\nCOPY . .\nRUN npx --no-install prisma generate\nCMD ["sh", "-c", "npx --no-install prisma migrate deploy && npx --no-install vitest run tests/payment-providers-db.test.ts tests/binance-internal.test.ts tests/invoice-payment-success.test.ts tests/invoice-message-owner.test.ts tests/invoice-document-delivery.test.ts tests/telegram-navigation-entities.test.ts tests/pending-order-cancel-db.test.ts tests/payment-idempotency.test.ts tests/storefront-web-order-db.test.ts tests/web-delivery-bundle.test.ts tests/storefront-product-guidance.test.ts tests/web-success-announcement.test.ts tests/web-success-worker.test.ts tests/completion-caption-worker.test.ts tests/product-post-delivery.test.ts tests/telegram-completion-ux.test.ts tests/success-channel.test.ts"]\n')
    run(['docker', 'build', '-f', str(source / 'Dockerfile.binance-receipt-test'), '-t', 'telegram-binance-receipt-tests:20260918', str(source)])
    run(['docker', 'network', 'create', '--internal', network], stdout=subprocess.DEVNULL); created_net = True
    run(['docker', 'run', '-d', '--name', database, '--network', network, '--memory', '512m', '--tmpfs', '/var/lib/postgresql/data:rw,size=256m', '-e', 'POSTGRES_USER=binance-receipttest', '-e', 'POSTGRES_PASSWORD=disposable-only', '-e', 'POSTGRES_DB=binance-receipt_audit', 'postgres:17-alpine'], stdout=subprocess.DEVNULL); created_db = True
    for attempt in range(30):
        if subprocess.run(['docker', 'exec', database, 'pg_isready', '-U', 'binance-receipttest'], capture_output=True).returncode == 0: break
        time.sleep(1)
    else: raise RuntimeError('Disposable DB not ready')
    url = 'postgresql://binance-receipttest:disposable-only@' + '127.0.0.1' + ':5432/binance-receipt_audit'
    body = '0002010102115204000053033605802ID5908K12 TEST6007JAKARTA6304'
    fixture = body + format(binascii.crc_hqx(body.encode(), 0xffff), '04X')
    env = {**os.environ, 'DATABASE_URL': url, 'DIRECT_URL': url, 'RUN_DB_TESTS': '1', 'RUN_PAYMENT_PROVIDER_DB_TESTS': '1', 'DIGITAL_STOCK_ENCRYPTION_KEY': '11'*32, 'STOREFRONT_CONTACT_LOOKUP_SECRET': 'disposable-binance-receipt-lookup-'+'x'*40, 'AUTH_SECRET': 'disposable-binance-receipt-auth-'+'x'*40, 'PAYMENT_QRIS_BASE_PAYLOAD': fixture, 'APP_URL': 'http://localhost:3000', 'STOREFRONT_CLERK_ENABLED': 'false'}
    args = ['docker', 'run', '--rm', '--network', 'container:'+database, '--memory', '1536m']
    for key in ['DATABASE_URL','DIRECT_URL','RUN_DB_TESTS','RUN_PAYMENT_PROVIDER_DB_TESTS','DIGITAL_STOCK_ENCRYPTION_KEY','STOREFRONT_CONTACT_LOOKUP_SECRET','AUTH_SECRET','PAYMENT_QRIS_BASE_PAYLOAD','APP_URL','STOREFRONT_CLERK_ENABLED']: args += ['-e', key]
    run(args + ['telegram-binance-receipt-tests:20260918'], env=env)
    (base / 'integration-passed.json').write_text(json.dumps({'passed': True, 'database': 'disposable-only', 'network': 'internal-only'}))
    print('LOCAL_DISPOSABLE_TESTS_PASSED', flush=True)
except Exception as error:
    state.write_text(json.dumps({'status': 'failed', 'error': type(error).__name__})); raise
finally:
    if created_db: subprocess.run(['docker','rm','-f',database], check=False, stdout=subprocess.DEVNULL)
    if created_net: subprocess.run(['docker','network','rm',network], check=False, stdout=subprocess.DEVNULL)
