import tarfile,json,subprocess,hashlib
from pathlib import Path
base=Path('/home/azureuser/storefront-activation-20260915')
archive=base/'admin-product-ux-image.tar.gz'
manifest=json.loads((base/'admin-product-ux-image.json').read_text())
assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()==manifest['sha256']
with tarfile.open(archive) as t:
 entry=json.load(t.extractfile('manifest.json'))[0]
 raw=t.extractfile(entry['Config']).read()
 expected=json.loads(raw)
actual=json.loads(subprocess.check_output(['docker','image','inspect','telegram-app:admin-product-ux-20260916']))[0]
assert actual['RootFS']['Layers']==expected['rootfs']['diff_ids']
for key in ['Env','Cmd','Entrypoint','WorkingDir','User','Healthcheck','ExposedPorts']:
 assert actual['Config'].get(key)==expected['config'].get(key),key
assert actual['Architecture']==expected['architecture']=='amd64'
assert actual['Os']==expected['os']=='linux'
print(json.dumps({'archive_verified':True,'rootfs_and_runtime_config_verified':True,'archive_config_digest':hashlib.sha256(raw).hexdigest(),'loaded_id':actual['Id']}))
