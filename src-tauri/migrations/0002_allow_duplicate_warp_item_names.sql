DROP INDEX IF EXISTS ux_warp_items_name;

CREATE INDEX IF NOT EXISTS ix_warp_items_name
ON warp_items (name);

INSERT OR IGNORE INTO schema_migrations (version)
VALUES ('0002_allow_duplicate_warp_item_names');
