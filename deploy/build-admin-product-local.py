from pathlib import Path
import subprocess,tarfile
root=Path(__file__).resolve().parent.parent
build=Path.home()/'.codex'/'build-cache'/'telegram-admin-product-ux'
build.mkdir(parents=True,exist_ok=True)
archive=root/'deploy/admin-product-ux-source.tar.gz'
with tarfile.open(archive,'w:gz') as t:
 for entry in ['src','public','prisma','package.json','package-lock.json','tsconfig.json','next.config.ts','next-env.d.ts','eslint.config.mjs','prisma.config.ts','Dockerfile','.dockerignore']:
  p=root/entry
  for f in ([p] if p.is_file() else p.rglob('*')):
   if f.is_file():
    assert not f.is_symlink() and not f.name.startswith('.env')
    t.add(f,arcname=f.relative_to(root),recursive=False)
with tarfile.open(archive) as t:t.extractall(build,filter='data')
subprocess.run(['docker','build','--platform','linux/amd64','--target','runner','-t','telegram-app:admin-product-ux-20260916',str(build)],check=True)
print('LOCAL_ADMIN_LAYOUT_BUILD_PASSED',flush=True)
