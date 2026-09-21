import gzip,hashlib,json,os,subprocess,tarfile
from pathlib import Path
base=Path('/opt/telegram-storefront-freestyle/web-fix-20260916')
base.mkdir(exist_ok=True)
state=base/'state.json'
try:
 state.write_text(json.dumps({'status':'building'}))
 manifest=json.loads(Path('/tmp/web-fix-20260916-manifest.json').read_text())
 values={}
 for line in (base.parent/'.env.production').read_text().splitlines():
  if '=' in line and not line.startswith('#'):
   k,v=line.split('=',1);values[k]=v.strip().strip('"').strip("'")
 for kind in ['backend','frontend']:
  source=base/kind;source.mkdir(exist_ok=False)
  archive=Path('/tmp')/manifest[kind]['filename']
  assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()==manifest[kind]['sha256']
  with tarfile.open(archive) as bundle:bundle.extractall(source,filter='data')
  args=['docker','build','--progress=plain','--target','runner','-t',('telegram-app' if kind=='backend' else 'telegram-storefront')+':web-fix-20260916']
  env=os.environ.copy()
  if kind=='frontend':
   for key in ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY','NEXT_PUBLIC_TELEGRAM_BOT_USERNAME']:
    env[key]=values[key];args+=['--build-arg',key]
  subprocess.run(args+[str(source)],env=env,check=True)
 archive=base/'backend-image.tar.gz'
 with gzip.open(archive,'wb',compresslevel=1) as output:
  process=subprocess.Popen(['docker','save','telegram-app:web-fix-20260916'],stdout=subprocess.PIPE)
  while chunk:=process.stdout.read(1024*1024):output.write(chunk)
  assert process.wait()==0
 state.write_text(json.dumps({'status':'built','sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(),'bytes':archive.stat().st_size}))
except Exception as error:
 state.write_text(json.dumps({'status':'failed','error':type(error).__name__}));raise
