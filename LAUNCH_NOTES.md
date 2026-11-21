# ProSolver Hospitals landing page prototype

Open `index.html` in a browser. This is a responsive, client-side demo, **not a live waitlist**.

## Implement before a public launch

1. Replace the simulated submit handler with a secure endpoint that accepts: problem_text (optional if audio exists), daily_problems (optional), email, phone, explicit consent version/time, and an audio object reference (optional). Upload audio over TLS to private storage with bounded size, type, duration and access. Obtain clear audio consent.
2. Create database tables: participants, submissions, audio_assets, referrals, point_ledger, reward_redemptions, consent_events. Generate referral codes **server-side**; do not trust client codes or client-side reward balances.
3. Require referred people to register and validate their email or phone; prevent self-referrals, repeated fake signups, and rewards for unverified invites. Cap redemptions, issue credits to approved easy work only, and manually approve anything costly.
4. Establish a real privacy notice, contact channel and retention/deletion policy. Do not collect patient-identifiable information or confidential hospital records. Add reporting, moderation, redaction, upload abuse prevention and explicit permission for any model training or onward sharing.
5. Separate ProSolver customer records from Trivsel: only share aggregated or appropriately de-identified patterns for product research by default. Request explicit permission before transferring identifiable submissions or contacting users about Trivsel.
6. Make service expectations explicit: free signup does not guarantee a solved problem; the service is human-operated; complex paid steps require quotation and customer approval. Never promise clinical advice or emergency handling.
7. Instrument privacy-conscious funnel events: page_view, typed_or_recorded, submission_success, share_click, referral_verified, reward_redeemed. Never include problem text, audio, phone or email in analytics payloads.
8. Replace the `.example` URL with the deployed domain; connect a privacy page, terms, and support contact. Add spam throttling and age/access policies if required.

## Suggested redemption pilot

- +1 point for one unique, verified referred colleague who also submits a valid work problem.
- 1 point unlocks one extra problem submission, subject to a monthly cap.
- After two or three validated referrals, offer a **reviewed** simple resolution step only when capacity exists. Complex work remains separately priced and optional.
- Award points only after verification, not on link clicks; do not reward patients' data or workplace secrets.

## Backend API contract (proposal)

- `POST /api/hospitals/waitlist` with validated problem fields, consent, contact details and voice attachment metadata; returns `submission_id` and `referral_url` on success.
- `POST /api/hospitals/audio-upload` for a bounded, authenticated upload flow.
- `GET /api/hospitals/referrals/me` for confirmed points and referral counts (only after identity verification).
- `POST /api/hospitals/redeem` to request credit redemption under server-side eligibility rules.
