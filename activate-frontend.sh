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
if 'Prelaunch draft' in privacy or 'Before launch' in privacy:
    sys.exit('STOP: Replace the draft privacy information with a completed, accurate notice before activating collection.')
for path in (Path('public/index.html'),Path('public/admin.html')):
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
