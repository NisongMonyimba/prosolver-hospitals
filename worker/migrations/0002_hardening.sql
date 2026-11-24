PRAGMA foreign_keys=ON;
ALTER TABLE members ADD COLUMN phone_verified_at TEXT;
ALTER TABLE members ADD COLUMN deleted_at TEXT;
ALTER TABLE submissions ADD COLUMN review_status TEXT NOT NULL DEFAULT 'new' CHECK(review_status IN ('new','under_review','awaiting_information','accepted','in_progress','resolved','archived','rejected'));
ALTER TABLE submissions ADD COLUMN category TEXT;
ALTER TABLE submissions ADD COLUMN priority TEXT CHECK(priority IN ('low','normal','high','critical'));
ALTER TABLE submissions ADD COLUMN founder_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN deleted_at TEXT;
ALTER TABLE submissions ADD COLUMN request_key TEXT;
ALTER TABLE submissions ADD COLUMN audio_type TEXT;
ALTER TABLE submissions ADD COLUMN updated_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_request_key ON submissions(request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_one_pending ON submissions(member_id) WHERE verified_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_review ON submissions(review_status,created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_verified ON submissions(verified_at,created_at);
CREATE TABLE IF NOT EXISTS consent_events (
  id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
  notice_version TEXT NOT NULL, contact_consent INTEGER NOT NULL CHECK(contact_consent=1), research_permission INTEGER NOT NULL DEFAULT 0 CHECK(research_permission IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_member ON sessions(member_id);
CREATE TABLE IF NOT EXISTS access_tokens (
  token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS send_cooldowns (
  email_hash TEXT PRIMARY KEY, sent_at TEXT NOT NULL, send_count INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT, detail TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS research_classifications (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(id), frequency TEXT, severity TEXT, urgency TEXT,
  operational_impact TEXT, resolution_effort TEXT, willingness_to_pay TEXT, product_opportunity TEXT,
  recurring_pattern TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deletion_events (
  id TEXT PRIMARY KEY, member_id TEXT REFERENCES members(id), submission_id TEXT, audio_key TEXT,
  status TEXT NOT NULL CHECK(status IN ('requested','completed','failed')), reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_referral_once ON ledger(reason,submission_id) WHERE reason='verified_referral';
CREATE TRIGGER IF NOT EXISTS ledger_nonnegative BEFORE INSERT ON ledger
WHEN NEW.delta < 0 AND (SELECT COALESCE(SUM(delta),0) FROM ledger WHERE member_id=NEW.member_id)+NEW.delta < 0
BEGIN SELECT RAISE(ABORT,'insufficient_points'); END;
CREATE TRIGGER IF NOT EXISTS ledger_immutable_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'ledger_immutable'); END;
CREATE TRIGGER IF NOT EXISTS ledger_immutable_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'ledger_immutable'); END;
