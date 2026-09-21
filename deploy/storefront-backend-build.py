"""Build backend candidates on Freestyle without accessing production data."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess
import tarfile

base = Path('/opt/telegram-storefront-freestyle/commerce-build-20260915')
base.mkdir(parents=True, exist_ok=True)
state = base / 'state.json'
try:
    state.write_text(json.dumps({'status': 'building'}))
    archive = Path('/tmp/storefront-backend-activation.tar.gz')
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == 'e8506dd5e258de3eff82e765a71cb0e862a4a66bc2653cb5f24978a281739ce4'
    source = base / 'source'
    source.mkdir(exist_ok=False)
    with tarfile.open(archive) as bundle:
        bundle.extractall(source, filter='data')
    images = ['telegram-app:clerk-candidate-20260915', 'telegram-migrate:clerk-candidate-20260915']
    for target, image in zip(['runner', 'migrator'], images):
        subprocess.run(['docker', 'build', '--progress=plain', '--target', target, '-t', image, str(source)], check=True)
    state.write_text(json.dumps({'status': 'exporting'}))
    output = base / 'images.tar.gz'
    with gzip.open(output, 'wb', compresslevel=1) as compressed:
        process = subprocess.Popen(['docker', 'save', *images], stdout=subprocess.PIPE)
        while chunk := process.stdout.read(1024 * 1024):
            compressed.write(chunk)
        if process.wait() != 0:
            raise RuntimeError('Image export failed')
    digest = hashlib.file_digest(output.open('rb'), 'sha256').hexdigest()
    state.write_text(json.dumps({'status': 'built', 'images': images, 'archive': str(output), 'sha256': digest, 'bytes': output.stat().st_size}))
    print('Backend candidate images built; no production deployment performed.', flush=True)
except Exception as error:
    state.write_text(json.dumps({'status': 'failed', 'error_type': type(error).__name__}))
    raise
