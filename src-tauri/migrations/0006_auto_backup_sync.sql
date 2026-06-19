ALTER TABLE cloud_backup_policies RENAME TO cloud_backup_policies_legacy;

CREATE TABLE cloud_backup_policies (
  provider TEXT PRIMARY KEY CHECK (provider IN ('google_drive')),
  auto_backup_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_backup_enabled IN (0, 1)),
  trigger_name TEXT NOT NULL DEFAULT 'data_changed' CHECK (
    trigger_name IN ('data_changed')
  ),
  min_interval_minutes INTEGER NOT NULL DEFAULT 0 CHECK (min_interval_minutes >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO cloud_backup_policies (
  provider,
  auto_backup_enabled,
  trigger_name,
  min_interval_minutes,
  created_at,
  updated_at
)
SELECT
  provider,
  auto_backup_enabled,
  'data_changed',
  min_interval_minutes,
  created_at,
  updated_at
FROM cloud_backup_policies_legacy;

DROP TABLE cloud_backup_policies_legacy;

CREATE TABLE backup_sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  local_content_hash TEXT,
  cloud_content_hash TEXT,
  local_backed_up_at TEXT,
  cloud_backed_up_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO backup_sync_state (id)
VALUES (1);

INSERT OR IGNORE INTO schema_migrations (version)
VALUES ('0006_auto_backup_sync');
