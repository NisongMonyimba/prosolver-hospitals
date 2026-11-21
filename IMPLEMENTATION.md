# ProSolver Hospitals real waitlist MVP

Architecture: GitHub Pages (public client) + Cloudflare Worker (API) + Cloudflare D1 (private records) + Cloudflare R2 (private voice) + Resend (email verification).

## Scope

- Typed and recorded problem submissions; max 2 minute recording and 5 MB; email/phone/consent required.
- Email verification required. Referral is awarded after a referred person verifies their first problem.
- One free verified problem per account; every extra verified submission consumes one point, earned from one verified referral.
- Private founder dashboard at `/admin.html`; backend requires `ADMIN_TOKEN` secret; private voice downloads.
- No public raw D1/R2 access. No Trivsel data-sharing integration. No paid resolution or clinical decisions.

## Deploy Cloudflare backend

1. Sign up for Cloudflare and enable R2. R2 may require payment-method activation, check current fees/limits first.
2. Sign up for Resend and verify a sending domain. Your own domain may be required for sending outside your account.
3. `cd ~/prosolver-hospitals/worker && npm install`
4. `npx wrangler login` (interactive).
5. `npx wrangler d1 create prosolver-hospitals --json` and copy `uuid` into `wrangler.jsonc` `database_id`.
6. `npx wrangler r2 bucket create prosolver-hospitals-private-audio`.
7. `npx wrangler d1 migrations apply prosolver-hospitals --remote`.
8. Change `PUBLIC_API_URL` in `wrangler.jsonc` to `https://prosolver-hospitals-api.<YOUR_SUBDOMAIN>.workers.dev`. Change `EMAIL_FROM` to a Resend verified sender.
9. `printf '%s' 'your-resend-key' | npx wrangler secret put RESEND_API_KEY` (prefer entering interactively, do not put keys in shell history).
10. `openssl rand -hex 32 | npx wrangler secret put ADMIN_TOKEN` and save the token securely before proceeding. Better: generate to an encrypted password manager and input interactively.
11. `npx wrangler deploy` and confirm `/health` returns `{ "ok": true }`.
12. Update `public/index.html` and `public/admin.html` meta `prosolver-api` to the deployed API URL, commit, and merge. Never substitute before backend setup.

## Before real user invitations

- Publish a complete privacy notice with responsible data controller, retention, data access/deletion instructions, data processors and hosting jurisdictions. Confirm applicable Ghana Data Protection Act obligations and registrations.
- Set up email support and a deletion workflow (D1 row + R2 object). Keep backups encrypted; restrict access to admin tokens and Cloudflare account.
- Test email confirmation on a real inbox, microphone upload, invalid referral, duplicate email, and one earned and redeemed point.
- Add bot protection, stricter global throttling, a secure authenticated user rewards screen, retention policies and a proper consent-history system before scaling.
- This is an MVP, not an audited healthcare data system. Do not submit patient identifiers, medical records or confidential hospital documents.

## Important limits

- Referral points cannot be redeemed for guaranteed human resolution. One point permits an extra verified problem submission only.
- The admin dashboard does not expose participant balances individually; the ledger is in D1. Audit the ledger before production reward promotions.
- R2 and D1 resources are private and require Cloudflare account credentials to administer. GitHub Pages is only the static client.

## Activate the GitHub Pages frontend

After verifying Cloudflare/Resend, complete `public/privacy.html`: replace the draft in full with the correct actual notice. Then run `bash ./activate-frontend.sh`. This will insert the Worker URL into both pages and test `/health`. Commit/push these changes to the feature branch and merge the PR after review. Keep the form disabled until this is done.
