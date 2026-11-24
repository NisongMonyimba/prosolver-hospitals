CREATE TABLE IF NOT EXISTS referral_reversals (
  referred_id TEXT PRIMARY KEY REFERENCES members(id),
  referrer_id TEXT NOT NULL REFERENCES members(id),
  ledger_id TEXT NOT NULL UNIQUE REFERENCES ledger(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
