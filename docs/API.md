# Worker API

All responses containing private data use `Cache-Control: no-store`. Worker responses set Referrer Policy, frame, MIME and Permissions Policy headers. Cross-origin requests are permitted only from the configured site origin; state-changing routes also check Origin. CORS is not authentication.

| Route | Method | Access | Purpose |
|---|---|---|---|
| `/health` | GET | public | Health and signup gate state |
| `/submit` | POST | origin + rate limit; session for extras | Multipart submission |
| `/verify` | GET, POST | one-time token | Landing page, then explicit verification |
| `/resend`, `/access` | POST | origin + cooldown | Generic email access response |
| `/access/confirm` | GET, POST | one-time token | Email session confirmation |
| `/rewards`, `/submit-again` | GET | member session | Referral and extra submission |
| `/me/delete` | POST | member session + origin | Erase member contact and submissions |
| `/admin/summary` | GET | admin token | Metrics, filters, latest 100, trends |
| `/admin/submissions/:id` | PATCH, DELETE | admin token + origin | Review or delete |
| `/admin/audio/:id` | GET | admin token | Private audio download |
| `/admin/research/:id` | PATCH | admin token + origin | Manual research classification |
| `/admin/research/export` | GET | admin token | Aggregate JSON only |
| `/admin/referrals/:referredId/reverse` | POST | admin token + origin | Audited point reversal |

`POST /submit` requires email, `+countrycode` phone, problem text or supported audio, consent `yes`, current `notice_version`, UUID `request_key`, optional daily challenges and referral code. Audio accepts WebM, Ogg, MP4, WAV and MP3 signatures up to 5 MiB. Normal form errors are JSON `{error}`; success is `202` with pending verification. Unknown email access requests receive the same generic `202` response as known members.
