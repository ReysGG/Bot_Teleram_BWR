"""Replace only the chosen app. No schema changes or financial mutations."""
import hashlib,json,os,shutil,subprocess,sys,time,urllib.request
from pathlib import Path
kind=sys.argv[1];assert kind in ['backend','frontend']
base=Path('/opt/telegram-store' if kind=='backend' else '/opt/telegram-storefront-freestyle')
container='telegram-store-app-1' if kind=='backend' else 'telegram-storefront-freestyle-app-1'
alias='telegram-app:production' if kind=='backend' else 'telegram-storefront:freestyle-test'
candidate=('telegram-app' if kind=='backend' else 'telegram-storefront')+':web-login-20260916'
compose=['docker','compose','-f',str(base/'docker-compose.yml')]
def inspect(name):return json.loads(subprocess.check_output(['docker','inspect',name]))[0]
def healthy():
 for _ in range(40):
  if inspect(container)['State'].get('Health',{}).get('Status')=='healthy':return
  time.sleep(2)
 raise RuntimeError('App did not become healthy')
old=inspect(container)['Image'];inspect(candidate)
backup=base/('backups/web-login-20260916-'+str(int(time.time())));backup.mkdir(mode=0o700,exist_ok=False)
shutil.copy2(base/'.env.production',backup/'.env.production');os.chmod(backup/'.env.production',0o600)
shutil.copy2(base/'docker-compose.yml',backup/'docker-compose.yml')
env_hash=hashlib.file_digest((base/'.env.production').open('rb'),'sha256').hexdigest()
subprocess.run(['docker','tag',old,alias.split(':')[0]+':rollback-web-login-20260916'],check=True)
db=None
if kind=='backend':
 db=inspect('telegram-store-db-1')
 subprocess.run(compose+['stop','scheduler','notification-worker'],check=True)
try:
 subprocess.run(['docker','tag',candidate,alias],check=True)
 subprocess.run(compose+['up','-d','--no-deps','app'],check=True);healthy()
 assert env_hash==hashlib.file_digest((base/'.env.production').open('rb'),'sha256').hexdigest()
 if db:assert inspect('telegram-store-db-1')['Id']==db['Id']
 url='https://70-153-137-10.sslip.io' if db else 'https://store.buildwithreys.com'
 with urllib.request.urlopen(url+'/api/health',timeout=30) as response:assert json.load(response)['ok']
 result={'deployed':True,'kind':kind,'image':inspect(container)['Image'],'backup':str(backup),'environment_unchanged':True}
 (backup/'result.json').write_text(json.dumps(result));print(json.dumps(result),flush=True)
except Exception:
 subprocess.run(['docker','tag',old,alias],check=True)
 subprocess.run(compose+['up','-d','--no-deps','app'],check=True);healthy();raise
finally:
 if db:subprocess.run(['docker','start','telegram-store-scheduler-1','telegram-store-notification-worker-1'],check=True)
