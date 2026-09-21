import gzip,subprocess,hashlib,json
from pathlib import Path
out=Path('deploy/web-login-image.tar.gz')
with gzip.open(out,'wb',compresslevel=1) as f:
 p=subprocess.Popen(['docker','save','telegram-app:web-login-20260916'],stdout=subprocess.PIPE)
 while data:=p.stdout.read(1024*1024):f.write(data)
 assert p.wait()==0
manifest={'sha256':hashlib.file_digest(out.open('rb'),'sha256').hexdigest(),'bytes':out.stat().st_size}
Path('deploy/web-login-image.json').write_text(json.dumps(manifest))
print(json.dumps(manifest))
