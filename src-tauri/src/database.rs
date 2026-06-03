use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const DATABASE_FILE_NAME: &str = "warp-tracker.sqlite";
const INIT_MIGRATION_VERSION: &str = "0001_init";
const INIT_MIGRATION_SQL: &str = include_str!("../migrations/0001_init.sql");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseStatus {
    pub database_path: String,
    pub database_file_exists: bool,
    pub is_initialized: bool,
    pub applied_migrations: Vec<String>,
    pub planned_migrations: Vec<String>,
    pub migration_count: usize,
    pub driver_status: DatabaseDriverStatus,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WarpItemCatalogInput {
    pub id: String,
    pub source_id: Option<String>,
    pub name: String,
    pub item_type: String,
    pub rarity: i64,
    pub icon_path: Option<String>,
    pub preview_path: Option<String>,
    pub portrait_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncWarpItemCatalogResult {
    pub received: usize,
    pub inserted: usize,
    pub updated: usize,
    pub unchanged: usize,
    pub total_in_database: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseDriverStatus {
    Ready,
}

struct Migration {
    version: &'static str,
    sql: &'static str,
}

struct ExistingWarpItem {
    source_id: Option<String>,
    name: String,
    item_type: String,
    rarity: i64,
    icon_path: Option<String>,
    preview_path: Option<String>,
    portrait_path: Option<String>,
}

const MIGRATIONS: &[Migration] = &[Migration {
    version: INIT_MIGRATION_VERSION,
    sql: INIT_MIGRATION_SQL,
}];

pub fn get_database_status(app: &AppHandle) -> Result<DatabaseStatus, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;

    let applied_migrations = list_applied_migrations(&connection)?;
    let planned_migrations = planned_migrations();

    Ok(DatabaseStatus {
        database_path: database_path.to_string_lossy().to_string(),
        database_file_exists: database_path.exists(),
        is_initialized: applied_migrations
            .iter()
            .any(|version| version == INIT_MIGRATION_VERSION),
        migration_count: applied_migrations.len(),
        applied_migrations,
        planned_migrations,
        driver_status: DatabaseDriverStatus::Ready,
    })
}

pub fn sync_warp_item_catalog(
    app: &AppHandle,
    items: Vec<WarpItemCatalogInput>,
) -> Result<SyncWarpItemCatalogResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    upsert_warp_item_catalog(&mut connection, &items)
}

fn resolve_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(DATABASE_FILE_NAME))
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))
}

fn open_database(database_path: &PathBuf) -> Result<Connection, String> {
    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create database directory: {error}"))?;
    }

    let connection = Connection::open(database_path)
        .map_err(|error| format!("Failed to open database: {error}"))?;

    apply_migrations(&connection)?;

    Ok(connection)
}

fn apply_migrations(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("Failed to enable SQLite foreign keys: {error}"))?;

    for migration in MIGRATIONS {
        connection
            .execute_batch(migration.sql)
            .map_err(|error| format!("Failed to apply migration {}: {error}", migration.version))?;
    }

    Ok(())
}

fn upsert_warp_item_catalog(
    connection: &mut Connection,
    items: &[WarpItemCatalogInput],
) -> Result<SyncWarpItemCatalogResult, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to start item catalog transaction: {error}"))?;
    let mut inserted = 0;
    let mut updated = 0;
    let mut unchanged = 0;

    {
        let mut existing_statement = transaction
            .prepare(
                "SELECT source_id, name, item_type, rarity, icon_path, preview_path, portrait_path
                 FROM warp_items
                 WHERE id = ?1",
            )
            .map_err(|error| format!("Failed to prepare item lookup statement: {error}"))?;
        let mut upsert_statement = transaction
            .prepare(
                "INSERT INTO warp_items (
                   id, source_id, name, item_type, rarity, icon_path, preview_path, portrait_path,
                   updated_at
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET
                   source_id = excluded.source_id,
                   name = excluded.name,
                   item_type = excluded.item_type,
                   rarity = excluded.rarity,
                   icon_path = excluded.icon_path,
                   preview_path = excluded.preview_path,
                   portrait_path = excluded.portrait_path,
                   updated_at = CURRENT_TIMESTAMP",
            )
            .map_err(|error| format!("Failed to prepare item upsert statement: {error}"))?;

        for item in items {
            validate_warp_item(item)?;

            let existing = existing_statement
                .query_row(params![&item.id], |row| {
                    Ok(ExistingWarpItem {
                        source_id: row.get(0)?,
                        name: row.get(1)?,
                        item_type: row.get(2)?,
                        rarity: row.get(3)?,
                        icon_path: row.get(4)?,
                        preview_path: row.get(5)?,
                        portrait_path: row.get(6)?,
                    })
                })
                .optional()
                .map_err(|error| format!("Failed to read existing item {}: {error}", item.id))?;

            match existing {
                Some(existing) if existing.is_same_as(item) => {
                    unchanged += 1;
                }
                existing => {
                    upsert_statement
                        .execute(params![
                            &item.id,
                            item.source_id.as_deref(),
                            &item.name,
                            &item.item_type,
                            item.rarity,
                            item.icon_path.as_deref(),
                            item.preview_path.as_deref(),
                            item.portrait_path.as_deref(),
                        ])
                        .map_err(|error| format!("Failed to upsert item {}: {error}", item.id))?;

                    if existing.is_some() {
                        updated += 1;
                    } else {
                        inserted += 1;
                    }
                }
            }
        }
    }

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit item catalog transaction: {error}"))?;

    let total_in_database = count_warp_items(connection)?;

    Ok(SyncWarpItemCatalogResult {
        received: items.len(),
        inserted,
        updated,
        unchanged,
        total_in_database,
    })
}

fn validate_warp_item(item: &WarpItemCatalogInput) -> Result<(), String> {
    if item.id.trim().is_empty() {
        return Err("Warp item id cannot be empty.".to_string());
    }

    if item.name.trim().is_empty() {
        return Err(format!("Warp item {} name cannot be empty.", item.id));
    }

    if !matches!(item.item_type.as_str(), "character" | "light_cone") {
        return Err(format!(
            "Warp item {} has unsupported item type {}.",
            item.id, item.item_type
        ));
    }

    if !matches!(item.rarity, 3 | 4 | 5) {
        return Err(format!(
            "Warp item {} has unsupported rarity {}.",
            item.id, item.rarity
        ));
    }

    Ok(())
}

fn list_applied_migrations(connection: &Connection) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare("SELECT version FROM schema_migrations ORDER BY version")
        .map_err(|error| format!("Failed to read migration table: {error}"))?;

    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("Failed to query migration table: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode migration rows: {error}"))
}

fn count_warp_items(connection: &Connection) -> Result<i64, String> {
    connection
        .query_row("SELECT COUNT(*) FROM warp_items", [], |row| row.get(0))
        .map_err(|error| format!("Failed to count warp items: {error}"))
}

fn planned_migrations() -> Vec<String> {
    MIGRATIONS
        .iter()
        .map(|migration| migration.version.to_string())
        .collect()
}

impl ExistingWarpItem {
    fn is_same_as(&self, item: &WarpItemCatalogInput) -> bool {
        self.source_id == item.source_id
            && self.name == item.name
            && self.item_type == item.item_type
            && self.rarity == item.rarity
            && self.icon_path == item.icon_path
            && self.preview_path == item.preview_path
            && self.portrait_path == item.portrait_path
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applies_initial_migration() {
        let connection = Connection::open_in_memory().expect("in-memory database");

        apply_migrations(&connection).expect("migration applies");

        let applied_migrations =
            list_applied_migrations(&connection).expect("migration table can be read");
        let table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'warp_pulls'",
                [],
                |row| row.get(0),
            )
            .expect("warp_pulls table count");

        assert_eq!(applied_migrations, vec![INIT_MIGRATION_VERSION]);
        assert_eq!(table_count, 1);
    }

    #[test]
    fn upserts_warp_item_catalog_and_reports_changes() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");

        let first = upsert_warp_item_catalog(
            &mut connection,
            &[
                catalog_item("character-1001", "1001", "Pela", "character", 4),
                catalog_item("light-cone-2001", "2001", "Data Bank", "light_cone", 3),
            ],
        )
        .expect("first sync");
        let second = upsert_warp_item_catalog(
            &mut connection,
            &[
                catalog_item("character-1001", "1001", "Pela", "character", 4),
                catalog_item("light-cone-2001", "2001", "Data Bank", "light_cone", 3),
            ],
        )
        .expect("second sync");
        let third = upsert_warp_item_catalog(
            &mut connection,
            &[catalog_item(
                "light-cone-2001",
                "2001",
                "Data Bank Updated",
                "light_cone",
                3,
            )],
        )
        .expect("third sync");

        assert_eq!(first.received, 2);
        assert_eq!(first.inserted, 2);
        assert_eq!(first.updated, 0);
        assert_eq!(first.unchanged, 0);
        assert_eq!(first.total_in_database, 2);
        assert_eq!(second.inserted, 0);
        assert_eq!(second.updated, 0);
        assert_eq!(second.unchanged, 2);
        assert_eq!(third.inserted, 0);
        assert_eq!(third.updated, 1);
        assert_eq!(third.unchanged, 0);
        assert_eq!(third.total_in_database, 2);
    }

    #[test]
    fn rejects_invalid_catalog_items() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");

        let result = upsert_warp_item_catalog(
            &mut connection,
            &[catalog_item("bad-item", "0", "Bad Item", "weapon", 6)],
        );

        assert!(result.is_err());
        assert_eq!(
            count_warp_items(&connection).expect("item count after failed sync"),
            0
        );
    }

    fn catalog_item(
        id: &str,
        source_id: &str,
        name: &str,
        item_type: &str,
        rarity: i64,
    ) -> WarpItemCatalogInput {
        WarpItemCatalogInput {
            id: id.to_string(),
            source_id: Some(source_id.to_string()),
            name: name.to_string(),
            item_type: item_type.to_string(),
            rarity,
            icon_path: Some(format!("icon/{id}.png")),
            preview_path: None,
            portrait_path: None,
        }
    }
}
