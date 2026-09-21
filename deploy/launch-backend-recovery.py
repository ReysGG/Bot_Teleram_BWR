import subprocess
with open('/home/ubuntu/backend-build.log','w') as log:
 subprocess.Popen(['python3','/home/ubuntu/build-backend.py'],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
print('Backend build started')
