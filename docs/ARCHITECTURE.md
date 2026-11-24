# Architecture

GitHub Pages serves `public/` on `main`; it holds no credentials or private records. The browser sends initial multipart submissions to the Cloudflare Worker. D1 stores members, submissions, consent, referrals, sessions, ledger and audit records. R2 stores audio under random private keys. Resend sends confirmation and access emails. The Worker alone reads D1/R2.

The email link opens a Worker GET landing page. A human POST confirms the token and receives an HttpOnly, Secure, SameSite=Lax session cookie. Rewards and additional submissions are hosted on the Worker origin so the session cookie works without cross-site cookies. Admin pages are public HTML but every private API route requires the Worker `ADMIN_TOKEN`.

Daily Worker cron clears expired or retained submissions and reconciles old unreferenced R2 objects. The frontend remains prelaunch while its API URL and notice version are placeholders. No Trivsel integration exists.

Operational trust boundaries: browser input, email delivery, Worker secrets, D1 transactions, private R2, founder browser memory. D1 and R2 have no shared transaction; see [security limitations](SECURITY.md).
