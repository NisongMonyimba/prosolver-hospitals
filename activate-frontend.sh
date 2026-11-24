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
if cfg['vars']['SYNTHETIC_TEST_ENABLED'] != 'false':
    sys.exit('STOP: Disable synthetic test mode before public activation.')
index=Path('public/index.html')
notice=re.search(r"const NOTICE = '([^']+)'",Path('worker/src/index.js').read_text()).group(1)
if 'draft' in notice or f'name="prosolver-notice-version" content="{notice}"' not in index.read_text():
    sys.exit('STOP: Approve and version the consent notice in public/index.html and worker/src/index.js first.')
PY
echo 'Checking backend health...'
URL="$(python3 - <<'PY'
import json
print(json.load(open('worker/wrangler.jsonc'))['vars']['PUBLIC_API_URL'])
PY
)"
HEALTH="$(curl --fail --silent --show-error --max-time 20 "$URL/health")"
python3 - "$HEALTH" <<'PY'
import json,sys
if json.loads(sys.argv[1]).get('signups_enabled') is not True:
    sys.exit('STOP: deployed Worker still reports public signup disabled.')
print('Deployed Worker reports public signup enabled.')
PY
python3 - <<'PY'
import json
from pathlib import Path
api=json.loads(Path('worker/wrangler.jsonc').read_text())['vars']['PUBLIC_API_URL']
for path in (Path('public/index.html'),Path('public/admin.html')):
    path.write_text(path.read_text().replace('REPLACE_WITH_WORKER_URL',api))
print('Frontend API URLs configured:',api)
PY
echo
printf '\nLive form can now be reviewed and published via the repository PR.\n'
