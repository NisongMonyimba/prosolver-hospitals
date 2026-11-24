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
python3 -m pip install websockets==17.1
python3 tests/browser_smoke.py
```

The API tests use an in-memory SQLite D1 adapter, a Map-based private R2 simulation and mocked Resend. The Chrome browser suite also starts Wrangler with temporary **local** D1 and R2 state, applies real local D1 migrations, and verifies R2 put/get/delete without remote resources or email delivery. It requires local loopback access and Chrome with its sandbox enabled.

## Operations

Read [deployment steps](docs/DEPLOYMENT.md), [launch gates](docs/LAUNCH_CHECKLIST.md), and [privacy requirements](docs/PRIVACY_CHECKLIST.md) before any production action. `scripts/deploy.sh` separates infrastructure, synthetic testing and public launch approvals. `worker/setup-cloudflare.sh` only checks existing resources and never creates them.

The GitHub Pages workflow publishes only `main`. The feature branch PR runs CI but is not published.
