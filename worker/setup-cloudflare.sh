#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null || { echo 'Install Node.js first' >&2; exit 1; }
command -v npm >/dev/null || { echo 'Install npm first' >&2; exit 1; }
npm install
npx wrangler whoami || npx wrangler login
printf '\nCloudflare D1 database creation (will use separate ProSolver resources)\n'
if ! npx wrangler d1 list --json | grep -q '"name": "prosolver-hospitals"'; then
  npx wrangler d1 create prosolver-hospitals --json
fi
printf '\nEnter the D1 UUID from the creation output/list: '
read -r d1id
[[ "$d1id" =~ ^[0-9a-f-]{36}$ ]] || { echo 'Invalid D1 UUID'; exit 1; }
python3 - "$d1id" <<'PY'
import sys,json
p='wrangler.jsonc';data=json.load(open(p));data['d1_databases'][0]['database_id']=sys.argv[1];open(p,'w').write(json.dumps(data,indent=2)+'\n')
PY
npx wrangler r2 bucket create prosolver-hospitals-private-audio || { echo 'R2 bucket creation failed or already exists. Check your Cloudflare account.'; exit 1; }
npx wrangler d1 migrations apply prosolver-hospitals --remote
printf '\nEnter your Cloudflare workers.dev subdomain only (not the whole URL): '
read -r subdomain
[[ "$subdomain" =~ ^[a-zA-Z0-9-]+$ ]] || { echo 'Invalid subdomain'; exit 1; }
printf '\nEnter the verified Resend sender address (example: Team <hello@yourdomain.com>): '
read -r sender
[[ "$sender" == *'@'* ]] || { echo 'Sender email invalid'; exit 1; }
python3 - "$subdomain" "$sender" <<'PY'
import sys,json
p='wrangler.jsonc';data=json.load(open(p));data['vars']['PUBLIC_API_URL']=f'https://prosolver-hospitals-api.{sys.argv[1]}.workers.dev';data['vars']['EMAIL_FROM']=sys.argv[2];open(p,'w').write(json.dumps(data,indent=2)+'\n')
PY
printf '\nEnter RESEND_API_KEY securely (input hidden): '
read -rs resend; printf '\n'
printf '%s' "$resend" | npx wrangler secret put RESEND_API_KEY
unset resend
printf '\nGenerate an admin token and save it in a password manager before continuing.\n'
token="$(openssl rand -hex 32)"
printf '\nADMIN TOKEN (SAVE SECURELY NOW): %s\n\n' "$token"
read -rp 'Have you saved the admin token securely? Type YES: ' confirmed
[[ "$confirmed" == YES ]] || { echo 'Stopped before deployment'; exit 1; }
printf '%s' "$token" | npx wrangler secret put ADMIN_TOKEN
unset token
npx wrangler deploy
printf '\nConfigure the two frontend meta tags with the PUBLIC_API_URL value, then commit and push for GitHub Pages.\n'
