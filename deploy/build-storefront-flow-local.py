from pathlib import Path
import subprocess,tarfile,hashlib,json,sys
root=Path(__file__).resolve().parent.parent
build=Path.home()/'.codex'/'build-cache'/'telegram-storefront-flow'
build.mkdir(parents=True,exist_ok=True)
archive=root/'deploy/storefront-flow-source.tar.gz'
with tarfile.open(archive,'w:gz') as t:
 for entry in ['src','public','prisma','tests','vitest.config.ts','package.json','package-lock.json','tsconfig.json','next.config.ts','next-env.d.ts','eslint.config.mjs','prisma.config.ts','Dockerfile','.dockerignore']:
  p=root/entry
  for f in ([p] if p.is_file() else p.rglob('*')):
   if f.is_file():
    assert not f.is_symlink() and not f.name.startswith('.env')
    t.add(f,arcname=f.relative_to(root),recursive=False)
(root/'deploy/storefront-flow-release-manifest.json').write_text(json.dumps({'sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()}))
with tarfile.open(archive) as t:t.extractall(build,filter='data')
with (build/'.dockerignore').open('a') as f:f.write('\ntests/\n')
if '--prepare-only' in sys.argv: sys.exit(0)
subprocess.run(['docker','build','--platform','linux/amd64','--target','runner','-t','telegram-app:storefront-flow-20260916',str(build)],check=True)
print('LOCAL_ADMIN_LAYOUT_BUILD_PASSED',flush=True)
