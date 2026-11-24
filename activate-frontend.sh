#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
import json,re,sys
from pathlib import Path
cfg=json.loads(Path('worker/wrangler.jsonc').read_text())
api=cfg['vars']['PUBLIC_API_URL']
if not re.fullmatch(r'https://[a-z0-9.-]+\.workers\.dev',api):
    sys.exit('STOP: Worker URL has not been configured')
privacy=Path('public/privacy.html').read_text()
if 'Prelaunch draft' in privacy or 'REQUIRED BEFORE LAUNCH' in privacy:
    sys.exit('STOP: Complete the privacy notice before activating collection.')
if cfg['vars']['PUBLIC_SIGNUPS_ENABLED'] != 'true':
    sys.exit('STOP: PUBLIC_SIGNUPS_ENABLED must be explicitly true after launch gates.')
if cfg['vars']['PRIVACY_NOTICE_APPROVED'] != 'true':
    sys.exit('STOP: Privacy notice approval must be explicitly recorded in Worker configuration.')
index=Path('public/index.html')
if '2026-11-draft' in index.read_text():
    sys.exit('STOP: Approve and version the consent notice in public/index.html and worker/src/index.js first.')
for path in (index,Path('public/admin.html')):
    data=path.read_text().replace('REPLACE_WITH_WORKER_URL',api)
    path.write_text(data)
print('Frontend API URLs configured:',api)
PY
echo 'Checking backend health...'
URL="$(python3 - <<'PY'
import json
print(json.load(open('worker/wrangler.jsonc'))['vars']['PUBLIC_API_URL'])
PY
)"
curl --fail --silent --show-error --max-time 20 "$URL/health"
echo
printf '\nLive form can now be reviewed and published via the repository PR.\n'
