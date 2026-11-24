# Controlled production deployment

No command in this document was run against production during the engineering task. Existing D1 UUID: `fef015df-c6fc-4c3a-9f6d-5acf6b3444ad`; R2 bucket: `prosolver-hospitals-private-audio`; Worker: `prosolver-hospitals-api`. Do not create them again. The founder must confirm the correct Cloudflare account in Wrangler before any write.

## Resend and configuration

1. Create or open a [Resend account](https://resend.com/). In Domains, add a domain the operator controls. Copy the **exact** DNS records shown by Resend into that domain's DNS provider. Resend's current verification displays the relevant DKIM, SPF and, where applicable, MX records; do not invent values. Wait until sending is verified. See [Resend's domain guidance](https://resend.com/changelog/domain-verification-events).
2. In API Keys, create a **Sending access** key restricted to the verified domain where offered. [Resend documents those permissions](https://resend.com/changelog/new-api-key-permissions). Store the key in a password manager. Choose an actual mailbox on the verified domain for `EMAIL_FROM`; do not commit a key or paste it into Codex/GitHub.
3. Edit `worker/wrangler.jsonc`: set the actual `PUBLIC_API_URL`, `EMAIL_FROM`, approved `RETENTION_DAYS`, and eventually the explicit signup/notice flags. Keep both flags `false` until all launch gates pass. Update the approved consent notice version in `worker/src/index.js` and `public/index.html` together. Complete `public/privacy.html`.
4. Enter secrets directly at a trusted terminal, through Wrangler's hidden prompt:

```bash
cd ~/prosolver-hospitals/worker
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ADMIN_TOKEN
```

Generate the admin token securely and save it in a password manager before entering it. Do not generate it into a visible terminal line or shell history.

## Order of operations

```bash
cd ~/prosolver-hospitals
./scripts/deploy.sh preflight
./scripts/deploy.sh full-test
./scripts/deploy.sh prod-check
./scripts/deploy.sh migrate-plan
```

Review the Cloudflare account, database UUID, bucket privacy, pending migration list and [launch checklist](LAUNCH_CHECKLIST.md). Production-changing modes require an explicit account ID, `PRODUCTION_GATES_ACK=YES` and an interactive typed Worker name. Set the actual account ID from the Cloudflare dashboard in your local shell (do not commit it):

```bash
export CLOUDFLARE_ACCOUNT_ID='<YOUR_VERIFIED_32_CHARACTER_ACCOUNT_ID>'
export EXPECTED_CF_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"
PRODUCTION_GATES_ACK=YES ./scripts/deploy.sh migrate-apply
PRODUCTION_GATES_ACK=YES ./scripts/deploy.sh secrets
PRODUCTION_GATES_ACK=YES ./scripts/deploy.sh worker-deploy
./scripts/deploy.sh smoke
```

The secrets mode prompts twice; if secrets were already set, use direct `wrangler secret put` only for the one being rotated. Verify the deployed Worker `/health` reports `signups_enabled:false` before controlled synthetic smoke tests. Do not flip the gate for public use until all checks pass.

To activate after privacy approval and smoke tests, set `PRIVACY_NOTICE_APPROVED=true` and `PUBLIC_SIGNUPS_ENABLED=true` in `worker/wrangler.jsonc`, review the diff, run `PRODUCTION_GATES_ACK=YES ./scripts/deploy.sh worker-deploy`, then `PRODUCTION_GATES_ACK=YES ./scripts/deploy.sh frontend-activate`. Commit and review the frontend changes in the existing PR; only a later merge to `main` publishes GitHub Pages. This task does not authorize merging.

## Production smoke sequence

Use only synthetic identities and recordings. With the public gate temporarily enabled under controlled conditions, submit one typed request, verify the email by pressing Confirm, inspect rewards, submit a second synthetic referred member, confirm referral credit, redeem one extra submission, test an audio request and private founder download, then delete all synthetic submissions and audio. Check D1 and R2 through approved Cloudflare tools after cleanup; account for immutable ledger/audit tombstones. Restore the gate to `false` if any check fails.
