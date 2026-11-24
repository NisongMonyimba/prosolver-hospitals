## ProSolver Hospitals MVP predeployment hardening

Completes the remaining engineering blockers on the existing MVP branch while keeping production and public registration closed.

### Changes

- Allows authenticated same-origin deletion from the rewards page CSP and audits CSP on all static and Worker pages.
- Fixes browser confirmation after a cross-origin entry when Chrome sends `Origin: null`, limited to Fetch Metadata confirmed same-origin navigation.
- Adds a bearer authenticated synthetic mode independent of public registration. It requires privacy approval, reserved `example.test` identities, marked content, a canonical silent WAV fixture, and no email delivery. Authenticated and scheduled cleanup erase synthetic submissions and R2 audio.
- Separates infrastructure, synthetic testing, and public launch approvals. Documents the first Worker deployment before `wrangler secret put` and provides exact founder commands.
- Adds Chrome browser tests and actual local Wrangler D1/R2 integration, plus new API and CSP tests. Improves session revocation, expired token cleanup, and paginated R2 orphan review.

### Verification

- 27 Worker API/migration/security tests passed; 5 Python frontend/CSP tests passed; static patch guard passed.
- Chrome browser flow passed mobile landing, typed form, audio controls, confirmation, sharing, rewards, founder dashboard, deletion, and closed signup.
- Actual local Wrangler D1 migrations and CRUD and R2 put/get/delete passed. Wrangler dry-run build and JS/Bash syntax passed.
- No production D1/R2 write, Worker deployment, real email delivery, public signup activation, or PR merge was performed.

### External gates

Privacy notice/legal approval, Cloudflare account verification, production migrations, first closed Worker deployment, verified Resend sender and secrets, synthetic production smoke and cleanup, real approved email delivery, backup/retention review, and explicit public launch approval remain with the founder. See `docs/DEPLOYMENT.md`, `docs/LAUNCH_CHECKLIST.md`, and `docs/TEST_REPORT.md`.
