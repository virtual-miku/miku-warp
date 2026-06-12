CREATE TABLE IF NOT EXISTS cloud_backup_snapshots (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),
  remote_file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  remote_md5_checksum TEXT,
  remote_modified_time TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  last_operation TEXT NOT NULL CHECK (last_operation IN ('upload', 'restore')),
  last_status TEXT NOT NULL CHECK (last_status IN ('success', 'failed')),
  last_message TEXT,
  uploaded_at TEXT,
  restored_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, remote_file_id)
);

CREATE INDEX IF NOT EXISTS ix_cloud_backup_snapshots_provider_modified
ON cloud_backup_snapshots (provider, remote_modified_time DESC);

CREATE TABLE IF NOT EXISTS cloud_backup_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),
  remote_file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upload', 'restore')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_cloud_backup_events_provider_created
ON cloud_backup_events (provider, created_at DESC);

INSERT OR IGNORE INTO schema_migrations (version)
VALUES ('0003_cloud_backup_audit');
