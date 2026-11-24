# Founder guide

Open `public/admin.html` on a trusted device after the frontend API URL is configured. Enter the `ADMIN_TOKEN` from the password manager. It remains only in tab memory; Clear session or close the tab when finished. Do not paste it into URLs or browser persistent storage.

The dashboard shows member, problem, referral and ledger metrics and 30 daily trend rows. Filter the latest 100 submissions by text, verification, type, review status and date. Use Save review to set status, category, priority and private notes. The Research classification panel records only founder-entered values. Export downloads grouped aggregate JSON; it excludes contact details, raw descriptions and recordings. Audio buttons download through an authenticated Worker route. Deletion removes active submission text and private R2 audio and writes a deletion event.

To reverse a fraudulent referral, identify the referred member ID through a controlled internal review, then POST `/admin/referrals/:referredId/reverse` with JSON `{"reason":"..."}` and an `Authorization: Bearer` header from a trusted client. The Worker records the reason and an immutable compensating ledger entry. If the point has already been used, the API refuses a reversal that would produce a negative balance; document the manual resolution.

Access to the founder dashboard should be limited to the operator. Cloudflare Access is an optional stronger outer layer. Do not place the dashboard behind public analytics or share downloaded files without separate privacy review.
