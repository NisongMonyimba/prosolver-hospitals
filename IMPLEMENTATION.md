# Implementation state

## Completed locally

- Default-off Worker configuration with the existing D1 UUID and private R2 binding.
- Versioned migrations `0001` through `0003`; typed or private audio submissions; 5 MiB audio and bounded multipart requests.
- Explicit POST email verification with hashed, expiring, single-use tokens; passwordless member sessions; resend/access links with cooldown.
- Referral accounting and immutable, nonnegative points ledger. One first verified submission is free; a later verified submission consumes one point. Fraud reversal writes a compensating ledger entry.
- Member rewards page and same-origin additional-submission form; founder dashboard with filters, review, categories, research classification, aggregate export, private audio and deletion.
- Daily retention cleanup and private R2 orphan reconciliation; restricted authenticated synthetic testing with public signup closed; separate deployment approvals; PR CI and deployment scripts.

## Tested locally

See [test report](docs/TEST_REPORT.md). Synthetic data only. Local SQLite and actual local Wrangler D1/R2 tests cover migrations and Worker request flows. Chrome tests mobile and member/founder browser flows. Wrangler dry-run builds the Worker. No remote Cloudflare smoke test has run.

## Requires manual configuration

- Operator identity, contact, lawful basis, transfer assessment and approved privacy notice; update the notice version in the Worker and frontend together.
- Resend verified domain and sender, Worker secrets, actual Worker URL, Cloudflare account/resource verification and production migrations.
- Real inbox and synthetic production smoke tests, retention and deletion review, founder authentication review, and explicit activation decision.

## Production pending

The production D1 database and Worker were not modified. Public registration stays disabled and the landing page still uses a placeholder API URL. PR #1 must remain unmerged until launch review.

## Known limits

Email and phone alone do not prove professional identity; phone is unverified. Rate limiting is per Cloudflare binding and obvious abuse remains a manual review task. Referral reversal cannot make points negative: if a point was spent, the founder must review the account manually. R2 and D1 cannot share one atomic transaction; cleanup retries and reconciliation reduce, but do not eliminate, partial-failure risk. No automated transcription, clinical advice, or compliance certification is provided.
