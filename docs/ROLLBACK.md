# Rollback

The fastest containment action is to set `PUBLIC_SIGNUPS_ENABLED=false` in `worker/wrangler.jsonc`, review the change and deploy the Worker with the production confirmation mode. This stops new public submissions while preserving existing records. If email is compromised, rotate `RESEND_API_KEY`; if founder access is compromised, rotate `ADMIN_TOKEN` in Cloudflare and the password manager.

For a Worker code regression, revert only the relevant code commit on the feature branch, run CI and dry-run build, then deploy the reviewed prior Worker. Never force-push. GitHub Pages can be rolled back by a normal revert to the last reviewed `main` commit; do not publish the feature branch directly.

Do not automatically reverse D1 migrations. Before any destructive database recovery, take a reviewed Cloudflare D1 backup/export, identify the affected migration and restore plan, and reconcile R2 objects separately. R2 and D1 are not one transaction. Document incident time, affected synthetic or real records, decisions, and any notices required by applicable law.
