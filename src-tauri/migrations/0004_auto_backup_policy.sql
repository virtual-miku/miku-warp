CREATE TABLE IF NOT EXISTS cloud_backup_policies (
  provider TEXT PRIMARY KEY CHECK (provider IN ('google_drive')),
  auto_backup_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_backup_enabled IN (0, 1)),
  trigger_name TEXT NOT NULL DEFAULT 'manual_import_saved' CHECK (
    trigger_name IN ('manual_import_saved')
  ),
  min_interval_minutes INTEGER NOT NULL DEFAULT 0 CHECK (min_interval_minutes >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO cloud_backup_policies (
  provider,
  auto_backup_enabled,
  trigger_name,
  min_interval_minutes
)
VALUES ('google_drive', 0, 'manual_import_saved', 0);

INSERT OR IGNORE INTO schema_migrations (version)
VALUES ('0004_auto_backup_policy');
