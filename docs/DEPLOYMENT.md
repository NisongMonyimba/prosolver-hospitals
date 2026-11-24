# Controlled production deployment

Existing resources only: D1 `prosolver-hospitals` (`fef015df-c6fc-4c3a-9f6d-5acf6b3444ad`), private R2 `prosolver-hospitals-private-audio`, Worker `prosolver-hospitals-api`. These commands have **not** been run on production. Run them from a trusted terminal after verifying the Cloudflare account. Never paste secrets into source, chat, terminal arguments, or logs.

## Approval gates

`INFRA_DEPLOY_APPROVED=YES` permits migrations, a closed Worker deployment, and secrets after account verification. `SYNTHETIC_TEST_APPROVED=YES` separately permits the restricted synthetic mode and test. `PUBLIC_LAUNCH_APPROVED=YES` separately permits opening registration and preparing the frontend for publication. Each production write also requires a matching account ID and an interactive typed Worker name. These are distinct owner decisions. A first Worker deployment does not depend on synthetic smoke testing or public launch approval.

The privacy notice is a prelaunch draft. Complete `public/privacy.html`, obtain the required legal and operator approval, set the same approved notice version in `public/index.html` and `worker/src/index.js`, and record `PRIVACY_NOTICE_APPROVED=true` before synthetic testing. Synthetic mode accepts only reserved `smoke-...@example.test` identities, `+999...` numbers, marked text, and the canonical silent WAV fixture. It never sends mail. No human or patient data belongs in this mode.

## Founder commands in order

1. Install Node 24 and Python 3.12 (or compatible versions), then run local tests. The browser test uses Chrome with its sandbox enabled and Python `websockets==17.1`.

```bash
cd ~/prosolver-hospitals
./scripts/deploy.sh preflight
./scripts/deploy.sh full-test
python3 -m pip install websockets==17.1
./scripts/deploy.sh browser-test
./scripts/deploy.sh prod-check
./scripts/deploy.sh migrate-plan
```

2. Verify the Cloudflare account, D1 UUID, private R2 bucket, migration plan, and recovery procedure. Keep `PUBLIC_SIGNUPS_ENABLED=false`, `SYNTHETIC_TEST_ENABLED=false`, and `PRIVACY_NOTICE_APPROVED=false`. Export the verified account ID in the trusted terminal. These commands apply migrations and perform the **first Worker deployment with registration closed**. The placeholder `PUBLIC_API_URL` and sender are safe at this stage because registration remains disabled. The deploy output supplies the actual Worker URL.

```bash
export CLOUDFLARE_ACCOUNT_ID='<VERIFIED_32_CHARACTER_ACCOUNT_ID>'
export EXPECTED_CF_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"
INFRA_DEPLOY_APPROVED=YES ./scripts/deploy.sh migrate-apply
INFRA_DEPLOY_APPROVED=YES ./scripts/deploy.sh worker-deploy
```

3. In Resend, verify a domain you control using the exact DNS records shown there and create a sending key for that domain. Store the key and a separately generated high entropy admin token in a password manager. The first deployment must exist before `wrangler secret put` is run. Edit `worker/wrangler.jsonc` with the actual `PUBLIC_API_URL` from deploy output, verified `EMAIL_FROM`, and approved `RETENTION_DAYS`. Then enter the two secrets through Wrangler's hidden prompts and deploy the still closed Worker again.

```bash
INFRA_DEPLOY_APPROVED=YES ./scripts/deploy.sh secrets
INFRA_DEPLOY_APPROVED=YES ./scripts/deploy.sh worker-deploy
./scripts/deploy.sh smoke
```

`/health` must report `signups_enabled:false`. A secret update on an existing Worker can create a new version; both gates remain false during this stage. Never rely on a secret update to configure the public URL or sender; deploy the reviewed configuration afterward.

4. After completing and approving the privacy notice and matching notice versions, set `PRIVACY_NOTICE_APPROVED=true`, keep `PUBLIC_SIGNUPS_ENABLED=false`, and set `SYNTHETIC_TEST_ENABLED=true` in `worker/wrangler.jsonc`. Generate a distinct 32+ character synthetic test token in a password manager. Install it through the hidden prompt before deploying synthetic mode. Approve synthetic testing separately; the test runner prompts for the synthetic and admin tokens without printing them.

```bash
SYNTHETIC_TEST_APPROVED=YES INFRA_DEPLOY_APPROVED=YES ./scripts/deploy.sh synthetic-secret
SYNTHETIC_TEST_APPROVED=YES INFRA_DEPLOY_APPROVED=YES DEPLOY_STAGE=synthetic ./scripts/deploy.sh worker-deploy
SYNTHETIC_TEST_APPROVED=YES ./scripts/deploy.sh synthetic-test
```

The test checks closed public registration, typed submission, POST confirmation, referral credit, reward redemption, silent audio upload and private retrieval, founder summary, and authenticated cleanup. The daily Worker schedule also removes synthetic records older than one day. If cleanup fails, use the authenticated `/synthetic/cleanup` endpoint immediately and inspect D1/R2. The test leaves immutable ledger, consent, deletion, and audit tombstones. It sends no real email.

5. After **all** items in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) are complete, set `SYNTHETIC_TEST_ENABLED=false`, `PUBLIC_SIGNUPS_ENABLED=true`, and keep `PRIVACY_NOTICE_APPROVED=true`. Record public launch approval. Deploy the Worker and verify `/health` reports `signups_enabled:true` before preparing the frontend. `frontend-activate` checks the deployed health response and approved notice, then replaces local API placeholders. Commit and review those frontend changes; a later approved merge to `main` publishes GitHub Pages. This engineering task does not authorize that merge.

```bash
PUBLIC_LAUNCH_APPROVED=YES INFRA_DEPLOY_APPROVED=YES DEPLOY_STAGE=public ./scripts/deploy.sh worker-deploy
./scripts/deploy.sh smoke
PUBLIC_LAUNCH_APPROVED=YES INFRA_DEPLOY_APPROVED=YES ./scripts/deploy.sh frontend-activate
```

If a public rollout must be closed, set both signup and synthetic flags to `false`, review the diff, then run `INFRA_DEPLOY_APPROVED=YES ./scripts/deploy.sh worker-deploy`. Do not reverse D1 migrations automatically.
