# ProSolver Hospitals

Human-led hospital problem discovery and waitlist MVP. GitHub Pages serves the landing page; a Cloudflare Worker handles submissions, verification, rewards, founder review and retention. D1 holds private records, R2 holds private audio, and Resend sends verification links. This project is separate from Trivsel.

**Prelaunch:** public collection is disabled by `PUBLIC_SIGNUPS_ENABLED=false` and `PRIVACY_NOTICE_APPROVED=false`. The privacy notice is a draft. No production migration, deployment, email delivery or activation was performed during this engineering task.

## Local checks

```bash
cd worker
npm ci
npm test
npm run test:syntax
npm run build:dry
cd ..
python3 tests/test_patch.py
python3 -m unittest discover -s tests -p 'test_*.py'
```

The API tests use an in-memory SQLite D1 adapter, a Map-based private R2 simulation and mocked Resend. The installed Wrangler dry-run validates configuration without deployment. A local Wrangler D1 invocation could not start its loopback listener in this restricted environment; migration SQL was executed by the SQLite harness.

## Operations

Read [deployment steps](docs/DEPLOYMENT.md), [launch gates](docs/LAUNCH_CHECKLIST.md), and [privacy requirements](docs/PRIVACY_CHECKLIST.md) before any production action. `scripts/deploy.sh` has separate read-only and explicit production-changing modes. `worker/setup-cloudflare.sh` now checks existing resources and never creates them.

The GitHub Pages workflow publishes only `main`. The feature branch PR runs CI but is not published.
