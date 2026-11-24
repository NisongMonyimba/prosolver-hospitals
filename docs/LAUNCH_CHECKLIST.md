# Public launch gates

All boxes must be evidenced before public collection:

- [ ] Local and PR CI checks pass; no failing or skipped required checks.
- [ ] Correct Cloudflare account, D1 binding and UUID, and private R2 bucket confirmed.
- [ ] Production migrations applied and inspected; backup and recovery reviewed.
- [ ] Resend sender/domain verified; restricted sending key and Worker secrets configured.
- [ ] Founder token authentication, unauthorized access rejection and optional Cloudflare Access reviewed.
- [ ] Privacy notice completed, versioned, approved and published; Ghana registration applicability resolved.
- [ ] Retention policy, backup retention, deletion workflow and abuse prevention reviewed.
- [ ] Controlled synthetic email, typed and audio, referral, points and founder dashboard smoke tests pass.
- [ ] Synthetic data and audio cleaned up, with immutable ledger/audit tombstones accounted for.
- [ ] Frontend API URL, consent notice version and public form states verified on mobile and desktop.
- [ ] Explicit owner decision recorded to set both `PRIVACY_NOTICE_APPROVED=true` and `PUBLIC_SIGNUPS_ENABLED=true`.

Current state: all production and legal gates are pending. The default configuration keeps both flags false. The existing feature branch must not be published to GitHub Pages until a later reviewed merge to `main`.
