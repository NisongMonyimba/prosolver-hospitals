CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  referral_code TEXT NOT NULL UNIQUE,
  referrer_code TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  problem TEXT NOT NULL DEFAULT '',
  daily TEXT NOT NULL DEFAULT '',
  audio_key TEXT,
  consent_version TEXT NOT NULL,
  verification_hash TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS referrals (
  referrer_id TEXT NOT NULL REFERENCES members(id),
  referred_id TEXT NOT NULL UNIQUE REFERENCES members(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (referrer_id,referred_id)
);
CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  submission_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_submissions_member ON submissions(member_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_member ON ledger(member_id);
