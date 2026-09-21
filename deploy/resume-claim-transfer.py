from pathlib import Path
import hashlib,json,shutil
source=Path('/home/ubuntu/claim-release-20260916/backend-image.tar.gz')
with source.open('rb') as f:
 prefix=f.read(98985596)
 assert hashlib.sha256(prefix).hexdigest() == '5d4ec74ec34b9a1a7aecfaed9dc9db32b1b7691a76b784bbb59162bd55e34862', 'Partial download prefix mismatch'
 with source.with_name('image-remainder.bin').open('wb') as out:shutil.copyfileobj(f,out)
p=source.with_name('image-remainder.bin')
print(json.dumps({'prefix_verified':True,'prefix_bytes':98985596,'remaining_bytes':p.stat().st_size,'tail_sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()}))
