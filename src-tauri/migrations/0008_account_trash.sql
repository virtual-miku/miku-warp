ALTER TABLE accounts ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS ix_accounts_trash
ON accounts (deleted_at DESC)
WHERE deleted_at IS NOT NULL;
