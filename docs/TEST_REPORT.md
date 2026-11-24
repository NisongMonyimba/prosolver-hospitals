# Predeployment test report

Local verification on 2026-11-24:

- `./scripts/deploy.sh full-test`: 27 API and migration tests passed; 5 Python frontend/CSP contract tests passed; static patch check passed; Worker syntax and Wrangler 4.167.0 dry-run build passed. `npm ci` reported zero vulnerabilities. The restricted workspace initially denied execution of esbuild's install binary; the approved test run succeeded.
- `./scripts/deploy.sh browser-test`: Chrome with its sandbox enabled passed mobile landing layout, disabled public registration, typed form UI, audio recording controls, verification confirmation, referral sharing, rewards, founder dashboard, and account deletion. The browser found a legitimate `Origin: null` confirmation POST; a Fetch Metadata restricted fix was added and the full browser flow passed.
- The browser test used **actual local Wrangler D1 and R2**, applied all three migrations, then exercised D1 submission, verification, referral and deletion, and R2 silent audio put, founder get and delete. No remote D1/R2 writes, production deployment, or real email delivery occurred.
- The API suite additionally covers synthetic authentication and identity restrictions, public gate isolation, canonical silent audio, no-email behavior, authenticated/scheduled cleanup, replay, referral accounting, retention, session revocation, and Worker CSP.

The production Worker, configured secrets, verified sender, actual email delivery, production synthetic smoke, privacy/legal approval, backup retention, and launch decision remain external gates. Local tests cannot prove distributed D1 concurrency under production traffic. The feature branch must remain unmerged until those gates are reviewed.
