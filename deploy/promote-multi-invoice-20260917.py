"""Replace only the chosen app. No schema changes or financial mutations."""
import hashlib,json,os,shutil,subprocess,sys,time,urllib.request
from pathlib import Path
kind=sys.argv[1];assert kind in ['backend','frontend']
base=Path('/opt/telegram-store' if kind=='backend' else '/opt/telegram-storefront-freestyle')
container='telegram-store-app-1' if kind=='backend' else 'telegram-storefront-freestyle-app-1'
alias='telegram-app:production' if kind=='backend' else 'telegram-storefront:freestyle-test'
candidate=('telegram-app' if kind=='backend' else 'telegram-storefront')+':multi-invoice-20260917'
compose=['docker','compose','-f',str(base/'docker-compose.yml')]
def inspect(name):return json.loads(subprocess.check_output(['docker','inspect',name]))[0]
def healthy():
 for _ in range(40):
  if inspect(container)['State'].get('Health',{}).get('Status')=='healthy':return
  time.sleep(2)
 raise RuntimeError('App did not become healthy')
old=inspect(container)['Image'];inspect(candidate)
backup=base/('backups/multi-invoice-20260917-'+str(int(time.time())));backup.mkdir(mode=0o700,exist_ok=False)
shutil.copy2(base/'.env.production',backup/'.env.production');os.chmod(backup/'.env.production',0o600)
shutil.copy2(base/'docker-compose.yml',backup/'docker-compose.yml')
env_hash=hashlib.file_digest((base/'.env.production').open('rb'),'sha256').hexdigest()
subprocess.run(['docker','tag',old,alias.split(':')[0]+':rollback-multi-invoice-20260917'],check=True)
db=None
if kind=='backend':
 db=inspect('telegram-store-db-1')
 subprocess.run(compose+['stop','scheduler','notification-worker'],check=True)
try:
 if kind=='backend':
  private=Path('/home/azureuser/binance-private-setup/credentials.env')
  updates=dict(line.split('=',1) for line in private.read_text().splitlines() if '=' in line)
  assert set(updates)=={'BINANCE_API_KEY','BINANCE_API_SECRET','BINANCE_API_BASE_URL'}
  assert updates['BINANCE_API_BASE_URL']=='https://api.binance.com'
  original=(base/'.env.production').read_text()
  preserved=[line for line in original.splitlines() if line.split('=',1)[0] not in updates]
  combined='\n'.join(preserved)+'\n'+'\n'.join(k+'='+v for k,v in updates.items())+'\n'
  temporary=base/'.env.production.binance-new'
  with temporary.open('w') as f:f.write(combined)
  os.chmod(temporary,0o600);os.replace(temporary,base/'.env.production')
  env_hash=hashlib.file_digest((base/'.env.production').open('rb'),'sha256').hexdigest()
 subprocess.run(['docker','tag',candidate,alias],check=True)
 subprocess.run(compose+['up','-d','--no-deps','app'],check=True);healthy()
 assert env_hash==hashlib.file_digest((base/'.env.production').open('rb'),'sha256').hexdigest()
 if db:assert inspect('telegram-store-db-1')['Id']==db['Id']
 url='https://70-153-137-10.sslip.io' if db else 'https://store.buildwithreys.com'
 with urllib.request.urlopen(url+'/api/health',timeout=30) as response:assert json.load(response)['ok']
 result={'deployed':True,'kind':kind,'image':inspect(container)['Image'],'backup':str(backup),'only_binance_api_configuration_updated':True}
 (backup/'result.json').write_text(json.dumps(result));print(json.dumps(result),flush=True)
except Exception:
 shutil.copy2(backup/'.env.production',base/'.env.production');os.chmod(base/'.env.production',0o600)
 subprocess.run(['docker','tag',old,alias],check=True)
 subprocess.run(compose+['up','-d','--no-deps','app'],check=True);healthy();raise
finally:
 if db:subprocess.run(['docker','start','telegram-store-scheduler-1','telegram-store-notification-worker-1'],check=True)
