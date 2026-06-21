CREATE TABLE IF NOT EXISTS trash_retention_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  retention_days INTEGER NOT NULL DEFAULT 183
    CHECK (retention_days IN (0, 30, 90, 183, 365)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO trash_retention_policy (id, retention_days)
VALUES (1, 183);
