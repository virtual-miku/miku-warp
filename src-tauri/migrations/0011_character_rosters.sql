CREATE TABLE IF NOT EXISTS character_rosters (
  account_id TEXT PRIMARY KEY
    REFERENCES accounts (id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  character_count INTEGER NOT NULL DEFAULT 0 CHECK (character_count >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
