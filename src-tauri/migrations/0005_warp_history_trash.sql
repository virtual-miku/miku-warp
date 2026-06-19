ALTER TABLE warp_pulls ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS ix_warp_pulls_trash
ON warp_pulls (account_id, deleted_at DESC)
WHERE deleted_at IS NOT NULL;

INSERT OR IGNORE INTO schema_migrations (version)
VALUES ('0005_warp_history_trash');
