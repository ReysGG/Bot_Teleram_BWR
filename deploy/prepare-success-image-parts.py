from pathlib import Path
import hashlib,json
base=Path('/home/ubuntu/web-success-release-20260916')
source=base/'backend-image.tar.gz'
assert hashlib.file_digest(source.open('rb'),'sha256').hexdigest()=='89370a88d98caf7906ec81d38326e24d5d6497fdce7a2fff1ef55555469b009e'
parts=[]
with source.open('rb') as f:
 while chunk:=f.read(25*1024*1024):
  name=f'image.part{len(parts):02d}'
  (base/name).write_bytes(chunk)
  parts.append({'name':name,'bytes':len(chunk),'sha256':hashlib.sha256(chunk).hexdigest()})
(base/'parts.json').write_text(json.dumps(parts))
print(json.dumps(parts))
