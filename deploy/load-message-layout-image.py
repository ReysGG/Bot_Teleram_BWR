import hashlib,json,subprocess
from pathlib import Path
base=Path('/home/azureuser/storefront-activation-20260915')
archive=base/'message-layout-image.tar.gz'
manifest=json.loads((base/'message-layout-image.json').read_text())
assert archive.stat().st_size==manifest['bytes']
assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()==manifest['sha256']
subprocess.run(['docker','load','-i',str(archive)],check=True)
image=json.loads(subprocess.check_output(['docker','image','inspect','telegram-app:message-layout-20260916']))[0]
assert image['Architecture']=='amd64' and image['Os']=='linux'
subprocess.run(['python3',str(base/'verify-message-layout-content.py')],check=True)
print('CHECKSUM_VERIFIED_AND_IMAGE_LOADED')
