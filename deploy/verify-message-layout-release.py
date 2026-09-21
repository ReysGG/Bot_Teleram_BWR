"""Read-only deployment acceptance: containers and HTTP health, no customer data."""
import json, subprocess, urllib.request
def inspect(name): return json.loads(subprocess.check_output(['docker','inspect',name]))[0]
app = inspect('telegram-store-app-1')
assert app['Image'] == inspect('telegram-app:message-layout-20260916')['Id']
assert app['State']['Health']['Status'] == 'healthy'
assert inspect('telegram-store-db-1')['Id'] == '359356a8f9adac28a5cc64218444ff46ca20f30804e6ea8b62b7af7c80abe4be'
workers = {name: inspect(name)['State']['Running'] for name in ['telegram-store-scheduler-1','telegram-store-notification-worker-1']}
assert all(workers.values())
with urllib.request.urlopen('https://70-153-137-10.sslip.io/api/health', timeout=25) as response:
    assert response.status == 200 and json.load(response)['ok']
print(json.dumps({'backend_healthy': True, 'candidate_image_active': True, 'db_container_unchanged': True, 'workers_running': workers}))
