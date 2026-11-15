"""Deploy the isolated quality worker using HF_TOKEN from the process environment."""
import base64
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen
from huggingface_hub import HfApi

root = Path(__file__).resolve().parents[1]
token = os.environ.get('HF_TOKEN')
if not token:
    raise SystemExit('Add HF_TOKEN to the ignored .env file before deployment.')
api = HfApi(token=token)
owner = api.whoami()['name']
repo_id = f'{owner}/agritrace-quality'
config_file = root / 'artifacts/quality/hosted-inference-config.json'
config_file.parent.mkdir(parents=True, exist_ok=True)
config = json.loads(config_file.read_text()) if config_file.exists() else {}
service_token = config.get('token') if config.get('repoId') == repo_id else secrets.token_urlsafe(48)
api.create_repo(repo_id=repo_id, repo_type='space', space_sdk='docker', private=False, exist_ok=True)
api.add_space_secret(repo_id=repo_id, key='QUALITY_SERVICE_TOKEN', value=service_token)
config_file.write_text(json.dumps({'repoId': repo_id, 'token': service_token}), encoding='utf-8')

with tempfile.TemporaryDirectory(prefix='quality-space-', dir=root/'artifacts/quality') as staging:
    folder = Path(staging)
    files = {
        'services/quality/Dockerfile': 'Dockerfile',
        'services/quality/space.README.md': 'README.md',
        'services/quality/infer.py': 'services/quality/infer.py',
        'services/quality/requirements.txt': 'services/quality/requirements.txt',
        'yolo_best_weights/detector_yolo26s_best.pt': 'yolo_best_weights/detector_yolo26s_best.pt',
        'yolo_best_weights/ripeness_yolo26s-cls_best.pt': 'yolo_best_weights/ripeness_yolo26s-cls_best.pt',
    }
    for source, destination in files.items():
        target = folder/destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root/source, target)
    api.upload_folder(repo_id=repo_id, repo_type='space', folder_path=folder, commit_message='Deploy authenticated AgriTrace tomato inference service')
print(f'Uploaded Space: https://huggingface.co/spaces/{repo_id}', flush=True)

endpoint = None
for attempt in range(60):
    runtime = api.get_space_runtime(repo_id)
    stage = str(runtime.stage)
    print(f'Space runtime: {stage}', flush=True)
    if 'ERROR' in stage or 'PAUSED' in stage:
        raise RuntimeError('Space did not start; inspect its build/runtime logs before connecting Vercel.')
    if 'RUNNING' in stage:
        host = api.space_info(repo_id).host
        endpoint = host if host.startswith('http') else 'https://' + host
        try:
            with urlopen(endpoint + '/health', timeout=15) as response:
                health = json.load(response)
            if health.get('status') == 'ok' and health.get('modelsLoaded'):
                break
        except Exception:
            pass
    time.sleep(20)
else:
    raise RuntimeError('Space is still building or warming up; retry after checking its status.')

packet = {'cropId': 'TOMATO', 'imageBase64': base64.b64encode((root/'artifacts/quality/tomato.jpg').read_bytes()).decode()}
request = Request(endpoint, data=json.dumps(packet).encode(), headers={'Authorization': 'Bearer '+service_token, 'Content-Type': 'application/json'}, method='POST')
with urlopen(request, timeout=90) as response:
    result = json.load(response)
if not result.get('success') or result.get('data', {}).get('status') != 'ESTIMATED':
    raise RuntimeError('Real-photo inference did not return an estimated result; Vercel configuration was not changed.')
print('Hosted real-photo inference passed.', flush=True)

cli = Path(os.environ['VERCEL_CLI_PATH'])
node = os.environ.get('NODE_EXECUTABLE', 'node')
for name, value in {'QUALITY_INFERENCE_URL': endpoint, 'QUALITY_SERVICE_TOKEN': service_token}.items():
    result = subprocess.run([node, str(cli), 'env', 'add', name, '--environment', 'production', '--sensitive', '--yes', '--force'], input=value, capture_output=True, text=True, cwd=root)
    if result.returncode:
        raise RuntimeError(f'Could not configure Vercel variable {name}; no secret values are printed.')
    print(f'Configured Vercel {name}', flush=True)
subprocess.run([node, str(cli), 'deploy', '--prod', '--yes'], cwd=root, check=True)
print('Quality service connected to the production deployment.', flush=True)
