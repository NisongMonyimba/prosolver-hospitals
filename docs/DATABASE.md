# Database

Migrations are append-only and run in order from `worker/migrations/`. `0001_init.sql` is preserved; `0002_hardening.sql` adds review, consent, sessions, cooldown, audit, research, retention and ledger guards; `0003_referral_reversals.sql` adds unique reversal tracking.

Key constraints: member email and referral code unique; one pending submission per member; request key unique; verification hash unique; one referred member per referral; ledger submission source unique; reversal referred member unique. A trigger blocks negative ledger balances and triggers block ledger edits/deletes. D1 `batch` groups verification, referral credit and point redemption in a transaction.

The first verified submission has no debit. Later verification inserts one `extra_submission` debit. A qualifying first verified referral inserts one `verified_referral` credit. A founder reversal inserts a separate `referral_reversal` debit if a balance remains. Ledger rows are never rewritten. Contact information is cleared on member deletion; ledger and audit evidence remains as a non-identifying tombstone. Confirm legal retention rules before activation.

Local migration tests execute all SQL against an empty in-memory SQLite database. Production D1 was not migrated or inspected through a remote write.
