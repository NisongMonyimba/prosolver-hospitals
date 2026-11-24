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
print('Local project, database UUID, bindings and site origin match.')
PY
}
confirm_write() {
  check_local
  [[ "${EXPECTED_CF_ACCOUNT_ID:-}" =~ ^[a-f0-9]{32}$ && "${CLOUDFLARE_ACCOUNT_ID:-}" == "$EXPECTED_CF_ACCOUNT_ID" ]] || { echo "Set EXPECTED_CF_ACCOUNT_ID and matching CLOUDFLARE_ACCOUNT_ID to the verified Cloudflare account ID"; exit 1; }
  [[ "${PRODUCTION_GATES_ACK:-}" == 'YES' ]] || { echo "Set PRODUCTION_GATES_ACK=YES only after completing docs/LAUNCH_CHECKLIST.md"; exit 1; }
  read -r -p "Type $WORKER to confirm production change: " answer
  [[ "$answer" == "$WORKER" ]] || { echo "Cancelled"; exit 1; }
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
    confirm_write
    (cd worker && npx wrangler d1 migrations apply "$DB_NAME" --remote)
    ;;
  secrets)
    confirm_write
    echo "Enter RESEND_API_KEY directly into Wrangler's hidden prompt."
    (cd worker && npx wrangler secret put RESEND_API_KEY)
    echo "Enter ADMIN_TOKEN directly into Wrangler's hidden prompt. Generate and store it in your password manager first."
    (cd worker && npx wrangler secret put ADMIN_TOKEN)
    ;;
  worker-deploy)
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
  frontend-activate)
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
    echo "Set PUBLIC_SIGNUPS_ENABLED=false in worker/wrangler.jsonc, review the diff, then run: PRODUCTION_GATES_ACK=YES ./scripts/deploy.sh worker-deploy"
    echo "Do not reverse D1 migrations automatically; restore only from a reviewed backup."
    ;;
  *)
    echo "Usage: $0 {preflight|local-test|full-test|prod-check|migrate-plan|migrate-apply|secrets|worker-deploy|smoke|frontend-activate|final-check|rollback}"
    ;;
esac
