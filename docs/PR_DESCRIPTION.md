## ProSolver Hospitals MVP hardening

Completes the local Worker, D1 schema, private audio, email verification, referrals, points, member rewards, founder review, research classification, deletion, retention, CI, and deployment documentation. Public collection remains disabled.

### Key changes

- POST-only human email confirmation with single-use hashed 24-hour tokens and passwordless member sessions.
- Atomic D1 referral and point accounting, immutable nonnegative ledger, and auditable fraud reversals.
- Bounded 5 MiB private audio uploads, R2 orphan cleanup, retention and deletion workflows.
- Founder dashboard with metrics, filters, review, private audio, manual research classification and aggregate export.
- Safe deployment scripts and prelaunch privacy/production gates. Existing D1 and R2 resources are reused.

### Local verification

- 23 API/migration/security tests passed; 0 failed, 0 skipped.
- 4 Python frontend contract tests passed; 0 failed, 0 skipped; existing static patch check passed.
- JS and Bash syntax checks passed; Wrangler 4.167.0 dry-run build passed.
- Offline `npm ci` hit a local sandbox restriction executing esbuild's install script; `npm ci --offline --ignore-scripts` passed and the Worker dry-run succeeded. PR CI performs a standard `npm ci`.

### Launch status

**Do not merge or activate for public collection.** The privacy notice still requires operator identity, contact, lawful basis and approval. Resend, Worker secrets, production migrations, remote smoke tests and founder launch gates remain manual. `PUBLIC_SIGNUPS_ENABLED=false` and `PRIVACY_NOTICE_APPROVED=false` by default. No production D1/R2 resource was modified or deployed in this task.

See `docs/LAUNCH_CHECKLIST.md`, `docs/DEPLOYMENT.md`, and `docs/TEST_REPORT.md`.
