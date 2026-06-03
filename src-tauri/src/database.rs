use rusqlite::Connection;
use serde::Serialize;
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseDriverStatus {
    Ready,
}

struct Migration {
    version: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[Migration {
    version: INIT_MIGRATION_VERSION,
    sql: INIT_MIGRATION_SQL,
}];

pub fn get_database_status(app: &AppHandle) -> Result<DatabaseStatus, String> {
    let database_path = resolve_database_path(app)?;

    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create database directory: {error}"))?;
    }

    let connection = Connection::open(&database_path)
        .map_err(|error| format!("Failed to open database: {error}"))?;

    apply_migrations(&connection)?;

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

fn resolve_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(DATABASE_FILE_NAME))
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))
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

fn planned_migrations() -> Vec<String> {
    MIGRATIONS
        .iter()
        .map(|migration| migration.version.to_string())
        .collect()
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
}
