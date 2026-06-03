PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  region TEXT,
  nickname TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_uid_region
ON accounts (uid, COALESCE(region, ''));

CREATE TABLE IF NOT EXISTS banners (
  id TEXT PRIMARY KEY,
  banner_type TEXT NOT NULL CHECK (
    banner_type IN (
      'departure',
      'standard',
      'character_event',
      'light_cone_event',
      'collaboration_character',
      'collaboration_light_cone'
    )
  ),
  name TEXT NOT NULL,
  version TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_banners_identity
ON banners (banner_type, name, COALESCE(version, ''));

CREATE TABLE IF NOT EXISTS warp_items (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('character', 'light_cone')),
  rarity INTEGER NOT NULL CHECK (rarity IN (3, 4, 5)),
  icon_path TEXT,
  preview_path TEXT,
  portrait_path TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_warp_items_name
ON warp_items (name);

CREATE UNIQUE INDEX IF NOT EXISTS ux_warp_items_source_id
ON warp_items (source_id)
WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'game_history', 'backup_restore')),
  banner_type TEXT CHECK (
    banner_type IN (
      'departure',
      'standard',
      'character_event',
      'light_cone_event',
      'collaboration_character',
      'collaboration_light_cone'
    )
  ),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  records_found INTEGER NOT NULL DEFAULT 0 CHECK (records_found >= 0),
  records_inserted INTEGER NOT NULL DEFAULT 0 CHECK (records_inserted >= 0),
  records_skipped INTEGER NOT NULL DEFAULT 0 CHECK (records_skipped >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  notes TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_import_batches_account_started
ON import_batches (account_id, started_at DESC);

CREATE TABLE IF NOT EXISTS warp_pulls (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  banner_id TEXT NOT NULL,
  warp_item_id TEXT NOT NULL,
  pulled_at TEXT NOT NULL,
  pulled_at_timezone TEXT,
  gacha_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('manual', 'game_history', 'backup_restore')),
  source_import_id TEXT,
  source_line_number INTEGER,
  sequence_in_timestamp_group INTEGER NOT NULL CHECK (sequence_in_timestamp_group >= 1),
  raw_item_name TEXT,
  pity_4 INTEGER CHECK (pity_4 IS NULL OR pity_4 >= 0),
  pity_5 INTEGER CHECK (pity_5 IS NULL OR pity_5 >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE,
  FOREIGN KEY (banner_id) REFERENCES banners (id) ON DELETE RESTRICT,
  FOREIGN KEY (warp_item_id) REFERENCES warp_items (id) ON DELETE RESTRICT,
  FOREIGN KEY (source_import_id) REFERENCES import_batches (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_warp_pulls_history
ON warp_pulls (account_id, banner_id, pulled_at, id);

CREATE INDEX IF NOT EXISTS ix_warp_pulls_item
ON warp_pulls (warp_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_warp_pulls_gacha
ON warp_pulls (account_id, banner_id, gacha_id)
WHERE gacha_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_warp_pulls_source_timestamp
ON warp_pulls (
  account_id,
  banner_id,
  pulled_at,
  warp_item_id,
  sequence_in_timestamp_group
)
WHERE gacha_id IS NULL;

INSERT OR IGNORE INTO schema_migrations (version)
VALUES ('0001_init');
