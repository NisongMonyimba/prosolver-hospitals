#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DB_ID='fef015df-c6fc-4c3a-9f6d-5acf6b3444ad'
DB_NAME='prosolver-hospitals'
BUCKET='prosolver-hospitals-private-audio'
WORKER='prosolver-hospitals-api'
BRANCH='feature/hospitals-real-waitlist-referrals-mvp-v1'
mode="${1:-help}"
check_local() {
  [[ "$(git branch --show-current)" == "$BRANCH" ]] || { echo "Wrong branch"; exit 1; }
  python3 - "$DB_ID" "$DB_NAME" "$BUCKET" "$WORKER" <<'PY'
import json,sys
from pathlib import Path
c=json.loads(Path('worker/wrangler.jsonc').read_text())
db=c['d1_databases'][0];r2=c['r2_buckets'][0]
assert c['name']==sys.argv[4]
assert db['binding']=='DB' and db['database_name']==sys.argv[2] and db['database_id']==sys.argv[1] and db['migrations_dir']=='migrations'
assert r2['binding']=='AUDIO' and r2['bucket_name']==sys.argv[3]
assert c['vars']['SITE_ORIGIN']=='https://nisongmonyimba.github.io'
assert c['vars']['PUBLIC_SIGNUPS_ENABLED'] in ('true','false')
assert c['vars']['PRIVACY_NOTICE_APPROVED'] in ('true','false')
assert c['vars']['SYNTHETIC_TEST_ENABLED'] in ('true','false')
print('Local project, database UUID, bindings and site origin match.')
PY
}
check_account() {
  check_local
  [[ "${EXPECTED_CF_ACCOUNT_ID:-}" =~ ^[a-f0-9]{32}$ && "${CLOUDFLARE_ACCOUNT_ID:-}" == "$EXPECTED_CF_ACCOUNT_ID" ]] || { echo "Set EXPECTED_CF_ACCOUNT_ID and matching CLOUDFLARE_ACCOUNT_ID to the verified Cloudflare account ID"; exit 1; }
}
confirm_write() {
  check_account
  [[ "${INFRA_DEPLOY_APPROVED:-}" == 'YES' ]] || { echo "Set INFRA_DEPLOY_APPROVED=YES after approving infrastructure deployment."; exit 1; }
  read -r -p "Type $WORKER to confirm production change: " answer
  [[ "$answer" == "$WORKER" ]] || { echo "Cancelled"; exit 1; }
}
check_flags() {
  python3 - "$1" <<'PY'
import json,sys
from pathlib import Path
import re
c=json.load(open('worker/wrangler.jsonc'))['vars']; mode=sys.argv[1]
public=c['PUBLIC_SIGNUPS_ENABLED']=='true'; synthetic=c['SYNTHETIC_TEST_ENABLED']=='true'
if public and synthetic: raise SystemExit('Public signup and synthetic test mode must not run together.')
if mode=='infra' and (public or synthetic): raise SystemExit('Infrastructure stage requires both public and synthetic gates false.')
if mode=='synthetic' and (public or not synthetic or c['PRIVACY_NOTICE_APPROVED']!='true'): raise SystemExit('Synthetic stage requires approved privacy, synthetic gate true and public signup false.')
if mode=='public' and (not public or synthetic or c['PRIVACY_NOTICE_APPROVED']!='true'): raise SystemExit('Public stage requires approved privacy, public signup true and synthetic gate false.')
if mode in ('synthetic','public'):
    privacy=Path('public/privacy.html').read_text()
    notice=re.search(r"const NOTICE = '([^']+)'",Path('worker/src/index.js').read_text()).group(1)
    frontend=Path('public/index.html').read_text()
    if 'Prelaunch draft' in privacy or 'REQUIRED BEFORE LAUNCH' in privacy or 'draft' in notice or f'name="prosolver-notice-version" content="{notice}"' not in frontend:
        raise SystemExit('Complete and align the approved privacy notice before this stage.')
    if not re.fullmatch(r'https://prosolver-hospitals-api\.[a-z0-9-]+\.workers\.dev',c['PUBLIC_API_URL']):
        raise SystemExit('Configure the exact deployed ProSolver Worker URL first.')
PY
}
confirm_synthetic() {
  [[ "${SYNTHETIC_TEST_APPROVED:-}" == 'YES' ]] || { echo "Set SYNTHETIC_TEST_APPROVED=YES only after approving controlled synthetic testing."; exit 1; }
  check_flags synthetic
}
confirm_public() {
  [[ "${PUBLIC_LAUNCH_APPROVED:-}" == 'YES' ]] || { echo "Set PUBLIC_LAUNCH_APPROVED=YES only after completing docs/LAUNCH_CHECKLIST.md."; exit 1; }
  check_flags public
}
case "$mode" in
  preflight)
    check_local
    node --version
    npm --version
    ;;
  local-test)
    check_local
    (cd worker && npm ci && npm test)
    python3 tests/test_patch.py
    ;;
  full-test)
    check_local
    (cd worker && npm ci && npm test && npm run test:syntax && npm run build:dry)
    python3 tests/test_patch.py
    python3 -m unittest discover -s tests -p 'test_*.py'
    ;;
  browser-test)
    check_local
    python3 tests/browser_smoke.py
    ;;
  prod-check)
    check_local
    (cd worker && npx wrangler whoami && npx wrangler d1 list && npx wrangler r2 bucket list)
    echo "Read-only listing complete. Confirm the account and resource IDs manually before any write."
    ;;
  migrate-plan)
    check_local
    (cd worker && npx wrangler d1 migrations list "$DB_NAME" --remote)
    ;;
  migrate-apply)
    check_flags infra
    confirm_write
    (cd worker && npx wrangler d1 migrations apply "$DB_NAME" --remote)
    ;;
  secrets)
    check_flags infra
    confirm_write
    echo "Only run after the first Worker deployment. Enter RESEND_API_KEY directly into Wrangler's hidden prompt."
    (cd worker && npx wrangler secret put RESEND_API_KEY)
    echo "Enter ADMIN_TOKEN directly into Wrangler's hidden prompt. Generate and store it in your password manager first."
    (cd worker && npx wrangler secret put ADMIN_TOKEN)
    ;;
  worker-deploy)
    stage="${DEPLOY_STAGE:-infra}"
    case "$stage" in
      infra) check_flags infra ;;
      synthetic) confirm_synthetic ;;
      public) confirm_public ;;
      *) echo "DEPLOY_STAGE must be infra, synthetic or public"; exit 1 ;;
    esac
    confirm_write
    (cd worker && npx wrangler deploy)
    ;;
  smoke)
    check_local
    url="$(python3 - <<'PY'
import json
print(json.load(open('worker/wrangler.jsonc'))['vars']['PUBLIC_API_URL'])
PY
)"
    [[ "$url" =~ ^https://[a-z0-9.-]+\.workers\.dev$ ]] || { echo "Configure PUBLIC_API_URL first"; exit 1; }
    curl --fail --silent --show-error --max-time 20 "$url/health"
    echo
    ;;
  synthetic-secret)
    confirm_synthetic
    confirm_write
    echo "Enter a unique 32+ character SYNTHETIC_TEST_TOKEN in Wrangler's hidden prompt."
    (cd worker && npx wrangler secret put SYNTHETIC_TEST_TOKEN)
    ;;
  synthetic-test)
    confirm_synthetic
    check_account
    python3 scripts/synthetic_smoke.py
    ;;
  frontend-activate)
    confirm_public
    confirm_write
    ./activate-frontend.sh
    ;;
  final-check)
    check_local
    "$0" smoke
    echo "Verify the production smoke-test items in docs/LAUNCH_CHECKLIST.md manually."
    ;;
  rollback)
    confirm_write
    echo "Set PUBLIC_SIGNUPS_ENABLED=false and SYNTHETIC_TEST_ENABLED=false in worker/wrangler.jsonc, review the diff, then run: INFRA_DEPLOY_APPROVED=YES ./scripts/deploy.sh worker-deploy"
    echo "Do not reverse D1 migrations automatically; restore only from a reviewed backup."
    ;;
  *)
    echo "Usage: $0 {preflight|local-test|full-test|browser-test|prod-check|migrate-plan|migrate-apply|secrets|worker-deploy|smoke|synthetic-secret|synthetic-test|frontend-activate|final-check|rollback}"
    ;;
esac
