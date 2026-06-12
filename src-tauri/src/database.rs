use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const DATABASE_FILE_NAME: &str = "warp-tracker.sqlite";
const BACKUP_DIRECTORY_NAME: &str = "backups";
const BACKUP_SCHEMA_VERSION: i64 = 1;
const INIT_MIGRATION_VERSION: &str = "0001_init";
const INIT_MIGRATION_SQL: &str = include_str!("../migrations/0001_init.sql");
const ALLOW_DUPLICATE_WARP_ITEM_NAMES_VERSION: &str = "0002_allow_duplicate_warp_item_names";
const ALLOW_DUPLICATE_WARP_ITEM_NAMES_SQL: &str =
    include_str!("../migrations/0002_allow_duplicate_warp_item_names.sql");
const CLOUD_BACKUP_AUDIT_VERSION: &str = "0003_cloud_backup_audit";
const CLOUD_BACKUP_AUDIT_SQL: &str = include_str!("../migrations/0003_cloud_backup_audit.sql");
const AUTO_BACKUP_POLICY_VERSION: &str = "0004_auto_backup_policy";
const AUTO_BACKUP_POLICY_SQL: &str = include_str!("../migrations/0004_auto_backup_policy.sql");
const GOOGLE_DRIVE_PROVIDER: &str = "google_drive";
const MANUAL_IMPORT_SAVED_TRIGGER: &str = "manual_import_saved";

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualImportAccountInput {
    pub id: String,
    pub uid: String,
    pub region: Option<String>,
    pub nickname: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveManualImportDraftInput {
    pub account: ManualImportAccountInput,
    pub status: String,
    pub records_found: usize,
    pub records_ready: usize,
    pub records_skipped: usize,
    pub issues_count: usize,
    pub pulls: Vec<SaveManualImportDraftPullInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveManualImportDraftPullInput {
    pub banner_type: String,
    pub warp_item_id: String,
    pub pulled_at: String,
    pub pulled_at_timezone: Option<String>,
    pub source_line_number: i64,
    pub sequence_in_timestamp_group: i64,
    pub raw_item_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveManualImportDraftResult {
    pub import_batch_id: String,
    pub records_found: usize,
    pub records_inserted: usize,
    pub records_skipped: usize,
    pub duplicate_records: usize,
    pub banner_count: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWarpPullsInput {
    pub account_id: String,
    pub banner_type: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupSnapshotInput {
    pub file_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteBackupSnapshotInput {
    pub file_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBackupSnapshotResult {
    pub backup_path: String,
    pub exported_at: String,
    pub accounts: usize,
    pub banners: usize,
    pub warp_items: usize,
    pub import_batches: usize,
    pub warp_pulls: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSnapshotSummary {
    pub backup_path: String,
    pub file_name: String,
    pub exported_at: String,
    pub accounts: usize,
    pub banners: usize,
    pub warp_items: usize,
    pub import_batches: usize,
    pub warp_pulls: usize,
}

#[derive(Debug)]
pub struct BackupSnapshotFile {
    pub backup_path: String,
    pub file_name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug)]
pub struct RecordCloudBackupSnapshotInput {
    pub provider: String,
    pub remote_file_id: String,
    pub file_name: String,
    pub remote_md5_checksum: Option<String>,
    pub remote_modified_time: Option<String>,
    pub size_bytes: Option<i64>,
    pub operation: String,
    pub status: String,
    pub message: Option<String>,
}

#[derive(Debug)]
pub struct RecordCloudBackupSnapshotResult {
    pub snapshot_id: String,
    pub event_id: String,
    pub total_events: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudBackupPolicy {
    pub provider: String,
    pub auto_backup_enabled: bool,
    pub trigger_name: String,
    pub min_interval_minutes: i64,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCloudBackupPolicyInput {
    pub provider: String,
    pub auto_backup_enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteBackupSnapshotResult {
    pub backup_path: String,
    pub file_name: String,
    pub remaining_snapshots: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupSnapshotResult {
    pub backup_path: String,
    pub exported_at: String,
    pub accounts: usize,
    pub banners: usize,
    pub warp_items: usize,
    pub import_batches: usize,
    pub warp_pulls: usize,
    pub warp_pulls_inserted: usize,
    pub duplicate_warp_pulls: usize,
    pub recomputed_banners: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WarpPullRow {
    pub id: String,
    pub banner_type: String,
    pub item_name: String,
    pub item_type: String,
    pub rarity: i64,
    pub pulled_at: String,
    pub source: String,
    pub pity_four_at_pull: Option<i64>,
    pub pity_five_at_pull: Option<i64>,
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

struct WarpPullPityCandidate {
    id: String,
    rarity: i64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupSnapshot {
    schema_version: i64,
    application: String,
    exported_at: String,
    applied_migrations: Vec<String>,
    accounts: Vec<BackupAccountRow>,
    banners: Vec<BackupBannerRow>,
    warp_items: Vec<BackupWarpItemRow>,
    import_batches: Vec<BackupImportBatchRow>,
    warp_pulls: Vec<BackupWarpPullRow>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupAccountRow {
    id: String,
    uid: String,
    region: Option<String>,
    nickname: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupBannerRow {
    id: String,
    banner_type: String,
    name: String,
    version: Option<String>,
    started_at: Option<String>,
    ended_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupWarpItemRow {
    id: String,
    source_id: Option<String>,
    name: String,
    item_type: String,
    rarity: i64,
    icon_path: Option<String>,
    preview_path: Option<String>,
    portrait_path: Option<String>,
    updated_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupImportBatchRow {
    id: String,
    account_id: String,
    source: String,
    banner_type: Option<String>,
    started_at: String,
    finished_at: Option<String>,
    records_found: i64,
    records_inserted: i64,
    records_skipped: i64,
    status: String,
    notes: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupWarpPullRow {
    id: String,
    account_id: String,
    banner_id: String,
    warp_item_id: String,
    pulled_at: String,
    pulled_at_timezone: Option<String>,
    gacha_id: Option<String>,
    source: String,
    source_import_id: Option<String>,
    source_line_number: Option<i64>,
    sequence_in_timestamp_group: i64,
    raw_item_name: Option<String>,
    pity_4: Option<i64>,
    pity_5: Option<i64>,
    created_at: String,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: INIT_MIGRATION_VERSION,
        sql: INIT_MIGRATION_SQL,
    },
    Migration {
        version: ALLOW_DUPLICATE_WARP_ITEM_NAMES_VERSION,
        sql: ALLOW_DUPLICATE_WARP_ITEM_NAMES_SQL,
    },
    Migration {
        version: CLOUD_BACKUP_AUDIT_VERSION,
        sql: CLOUD_BACKUP_AUDIT_SQL,
    },
    Migration {
        version: AUTO_BACKUP_POLICY_VERSION,
        sql: AUTO_BACKUP_POLICY_SQL,
    },
];

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

pub fn save_manual_import_draft(
    app: &AppHandle,
    draft: SaveManualImportDraftInput,
) -> Result<SaveManualImportDraftResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    save_manual_import_draft_to_database(&mut connection, &draft)
}

pub fn list_warp_pulls(
    app: &AppHandle,
    query: ListWarpPullsInput,
) -> Result<Vec<WarpPullRow>, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;

    list_warp_pulls_from_database(&connection, &query)
}

pub fn export_backup_snapshot(app: &AppHandle) -> Result<ExportBackupSnapshotResult, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;
    let backup_directory = resolve_backup_directory(app)?;

    export_backup_snapshot_to_directory(&connection, &backup_directory)
}

pub fn list_backup_snapshots(app: &AppHandle) -> Result<Vec<BackupSnapshotSummary>, String> {
    let backup_directory = resolve_backup_directory(app)?;

    list_backup_snapshots_in_directory(&backup_directory)
}

pub fn read_latest_backup_snapshot_file(app: &AppHandle) -> Result<BackupSnapshotFile, String> {
    let backup_directory = resolve_backup_directory(app)?;
    let backup_path = find_latest_backup_snapshot_path(&backup_directory)?;

    read_backup_snapshot_file(&backup_path)
}

pub fn delete_backup_snapshot(
    app: &AppHandle,
    input: DeleteBackupSnapshotInput,
) -> Result<DeleteBackupSnapshotResult, String> {
    let backup_directory = resolve_backup_directory(app)?;
    let backup_path = resolve_backup_snapshot_path(&backup_directory, &input.file_name)?;

    delete_backup_snapshot_file(&backup_directory, &backup_path)
}

pub fn restore_latest_backup_snapshot(
    app: &AppHandle,
) -> Result<RestoreBackupSnapshotResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;
    let backup_directory = resolve_backup_directory(app)?;
    let backup_path = find_latest_backup_snapshot_path(&backup_directory)?;

    restore_backup_snapshot_from_file(&mut connection, &backup_path)
}

pub fn restore_backup_snapshot(
    app: &AppHandle,
    input: RestoreBackupSnapshotInput,
) -> Result<RestoreBackupSnapshotResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;
    let backup_directory = resolve_backup_directory(app)?;
    let backup_path = resolve_backup_snapshot_path(&backup_directory, &input.file_name)?;

    restore_backup_snapshot_from_file(&mut connection, &backup_path)
}

pub fn restore_backup_snapshot_from_bytes(
    app: &AppHandle,
    backup_source: &str,
    bytes: &[u8],
) -> Result<RestoreBackupSnapshotResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    restore_backup_snapshot_payload(&mut connection, backup_source, bytes)
}

pub fn record_cloud_backup_snapshot(
    app: &AppHandle,
    input: RecordCloudBackupSnapshotInput,
) -> Result<RecordCloudBackupSnapshotResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    record_cloud_backup_snapshot_to_database(&mut connection, &input)
}

pub fn get_cloud_backup_policy(app: &AppHandle) -> Result<CloudBackupPolicy, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    get_cloud_backup_policy_from_database(&mut connection, GOOGLE_DRIVE_PROVIDER)
}

pub fn update_cloud_backup_policy(
    app: &AppHandle,
    input: UpdateCloudBackupPolicyInput,
) -> Result<CloudBackupPolicy, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    update_cloud_backup_policy_in_database(&mut connection, &input)
}

fn resolve_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(DATABASE_FILE_NAME))
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))
}

fn resolve_backup_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(BACKUP_DIRECTORY_NAME))
        .map_err(|error| format!("Failed to resolve backup directory: {error}"))
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
        .execute_batch(
            "PRAGMA foreign_keys = ON;

             CREATE TABLE IF NOT EXISTS schema_migrations (
               version TEXT PRIMARY KEY,
               applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
             );",
        )
        .map_err(|error| format!("Failed to prepare migration metadata: {error}"))?;

    let mut applied_migrations = list_applied_migrations(connection)?;

    for migration in MIGRATIONS {
        if applied_migrations
            .iter()
            .any(|version| version == migration.version)
        {
            continue;
        }

        connection
            .execute_batch(migration.sql)
            .map_err(|error| format!("Failed to apply migration {}: {error}", migration.version))?;
        applied_migrations.push(migration.version.to_string());
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

fn save_manual_import_draft_to_database(
    connection: &mut Connection,
    draft: &SaveManualImportDraftInput,
) -> Result<SaveManualImportDraftResult, String> {
    validate_manual_import_draft(draft)?;

    let import_batch_id = create_import_batch_id()?;
    let banner_types = draft
        .pulls
        .iter()
        .map(|pull| pull.banner_type.as_str())
        .collect::<HashSet<_>>();
    let batch_banner_type = if banner_types.len() == 1 {
        banner_types.iter().next().copied()
    } else {
        None
    };
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to start manual import transaction: {error}"))?;

    upsert_account(&transaction, &draft.account)?;

    for banner_type in &banner_types {
        ensure_banner(&transaction, banner_type)?;
    }

    insert_import_batch(
        &transaction,
        &import_batch_id,
        &draft.account.id,
        batch_banner_type,
        draft.records_found,
    )?;

    let mut records_inserted = 0;
    let mut duplicate_records = 0;

    {
        let mut insert_pull_statement = transaction
            .prepare(
                "INSERT OR IGNORE INTO warp_pulls (
                   id, account_id, banner_id, warp_item_id, pulled_at, pulled_at_timezone,
                   source, source_import_id, source_line_number, sequence_in_timestamp_group,
                   raw_item_name
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'manual', ?7, ?8, ?9, ?10)",
            )
            .map_err(|error| format!("Failed to prepare manual pull insert statement: {error}"))?;

        for pull in &draft.pulls {
            let banner_id = banner_id_for_type(&pull.banner_type);
            let pull_id = manual_pull_id(
                &draft.account.id,
                &banner_id,
                &pull.pulled_at,
                &pull.warp_item_id,
                pull.sequence_in_timestamp_group,
            );
            let affected_rows = insert_pull_statement
                .execute(params![
                    pull_id,
                    &draft.account.id,
                    banner_id,
                    &pull.warp_item_id,
                    &pull.pulled_at,
                    pull.pulled_at_timezone.as_deref(),
                    &import_batch_id,
                    pull.source_line_number,
                    pull.sequence_in_timestamp_group,
                    &pull.raw_item_name,
                ])
                .map_err(|error| {
                    format!(
                        "Failed to insert manual pull {} at {}: {error}",
                        pull.raw_item_name, pull.pulled_at
                    )
                })?;

            if affected_rows == 1 {
                records_inserted += 1;
            } else {
                duplicate_records += 1;
            }
        }
    }

    let records_skipped = draft.records_skipped + duplicate_records;
    for banner_type in &banner_types {
        let banner_id = banner_id_for_type(banner_type);
        recompute_pity_for_account_banner(&transaction, &draft.account.id, &banner_id)?;
    }

    update_import_batch_result(
        &transaction,
        &import_batch_id,
        records_inserted,
        records_skipped,
    )?;

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit manual import transaction: {error}"))?;

    Ok(SaveManualImportDraftResult {
        import_batch_id,
        records_found: draft.records_found,
        records_inserted,
        records_skipped,
        duplicate_records,
        banner_count: banner_types.len(),
    })
}

fn list_warp_pulls_from_database(
    connection: &Connection,
    query: &ListWarpPullsInput,
) -> Result<Vec<WarpPullRow>, String> {
    validate_list_warp_pulls_query(query)?;

    if let Some(banner_type) = &query.banner_type {
        banner_label(banner_type)?;

        let mut statement = connection
            .prepare(
                "SELECT id, banner_type, item_name, item_type, rarity, pulled_at, source,
                        pity_4, pity_5, sequence_in_timestamp_group
                 FROM (
                   SELECT
                     wp.id,
                     b.banner_type,
                     wi.name AS item_name,
                     wi.item_type,
                     wi.rarity,
                     wp.pulled_at,
                     wp.source,
                     wp.pity_4,
                     wp.pity_5,
                     wp.sequence_in_timestamp_group
                   FROM warp_pulls wp
                   INNER JOIN banners b ON b.id = wp.banner_id
                   INNER JOIN warp_items wi ON wi.id = wp.warp_item_id
                   WHERE wp.account_id = ?1 AND b.banner_type = ?2
                   ORDER BY wp.pulled_at DESC, wp.sequence_in_timestamp_group DESC, wp.id DESC
                   LIMIT ?3
                 )
                 ORDER BY pulled_at ASC, sequence_in_timestamp_group ASC, id ASC",
            )
            .map_err(|error| format!("Failed to prepare warp pull query: {error}"))?;

        let rows = statement
            .query_map(
                params![&query.account_id, banner_type, query_limit(query) as i64],
                map_warp_pull_row,
            )
            .map_err(|error| format!("Failed to query warp pulls: {error}"))?;

        return rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Failed to decode warp pull rows: {error}"));
    }

    let mut statement = connection
        .prepare(
            "SELECT id, banner_type, item_name, item_type, rarity, pulled_at, source,
                    pity_4, pity_5, sequence_in_timestamp_group
             FROM (
               SELECT
                 wp.id,
                 b.banner_type,
                 wi.name AS item_name,
                 wi.item_type,
                 wi.rarity,
                 wp.pulled_at,
                 wp.source,
                 wp.pity_4,
                 wp.pity_5,
                 wp.sequence_in_timestamp_group
               FROM warp_pulls wp
               INNER JOIN banners b ON b.id = wp.banner_id
               INNER JOIN warp_items wi ON wi.id = wp.warp_item_id
               WHERE wp.account_id = ?1
               ORDER BY wp.pulled_at DESC, wp.sequence_in_timestamp_group DESC, wp.id DESC
               LIMIT ?2
             )
             ORDER BY pulled_at ASC, sequence_in_timestamp_group ASC, id ASC",
        )
        .map_err(|error| format!("Failed to prepare warp pull query: {error}"))?;

    let rows = statement
        .query_map(
            params![&query.account_id, query_limit(query) as i64],
            map_warp_pull_row,
        )
        .map_err(|error| format!("Failed to query warp pulls: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode warp pull rows: {error}"))
}

fn export_backup_snapshot_to_directory(
    connection: &Connection,
    backup_directory: &Path,
) -> Result<ExportBackupSnapshotResult, String> {
    let snapshot = build_backup_snapshot(connection)?;
    let backup_path = backup_directory.join(create_backup_file_name()?);
    let payload = serde_json::to_string_pretty(&snapshot)
        .map_err(|error| format!("Failed to serialize backup snapshot: {error}"))?;

    fs::create_dir_all(backup_directory)
        .map_err(|error| format!("Failed to create backup directory: {error}"))?;
    fs::write(&backup_path, payload)
        .map_err(|error| format!("Failed to write backup snapshot: {error}"))?;

    Ok(ExportBackupSnapshotResult {
        backup_path: backup_path.to_string_lossy().to_string(),
        exported_at: snapshot.exported_at.clone(),
        accounts: snapshot.accounts.len(),
        banners: snapshot.banners.len(),
        warp_items: snapshot.warp_items.len(),
        import_batches: snapshot.import_batches.len(),
        warp_pulls: snapshot.warp_pulls.len(),
    })
}

fn restore_backup_snapshot_from_file(
    connection: &mut Connection,
    backup_path: &Path,
) -> Result<RestoreBackupSnapshotResult, String> {
    let payload = fs::read_to_string(backup_path)
        .map_err(|error| format!("Failed to read backup snapshot: {error}"))?;
    let backup_source = backup_path.to_string_lossy().to_string();

    restore_backup_snapshot_text(connection, &backup_source, &payload)
}

fn restore_backup_snapshot_payload(
    connection: &mut Connection,
    backup_source: &str,
    bytes: &[u8],
) -> Result<RestoreBackupSnapshotResult, String> {
    let payload = std::str::from_utf8(bytes)
        .map_err(|error| format!("Backup snapshot is not valid UTF-8: {error}"))?;

    restore_backup_snapshot_text(connection, backup_source, payload)
}

fn restore_backup_snapshot_text(
    connection: &mut Connection,
    backup_source: &str,
    payload: &str,
) -> Result<RestoreBackupSnapshotResult, String> {
    let snapshot: BackupSnapshot = serde_json::from_str(payload)
        .map_err(|error| format!("Failed to parse backup snapshot: {error}"))?;

    validate_backup_snapshot(&snapshot)?;
    restore_backup_snapshot_to_database(connection, backup_source, &snapshot)
}

fn restore_backup_snapshot_to_database(
    connection: &mut Connection,
    backup_source: &str,
    snapshot: &BackupSnapshot,
) -> Result<RestoreBackupSnapshotResult, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to start backup restore transaction: {error}"))?;

    restore_backup_accounts(&transaction, &snapshot.accounts)?;
    restore_backup_banners(&transaction, &snapshot.banners)?;
    restore_backup_warp_items(&transaction, &snapshot.warp_items)?;
    restore_backup_import_batches(&transaction, &snapshot.import_batches)?;
    let (warp_pulls_inserted, duplicate_warp_pulls) =
        restore_backup_warp_pulls(&transaction, &snapshot.warp_pulls)?;
    let recomputed_banners = recompute_pity_for_snapshot(&transaction, snapshot)?;

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit backup restore transaction: {error}"))?;

    Ok(RestoreBackupSnapshotResult {
        backup_path: backup_source.to_string(),
        exported_at: snapshot.exported_at.clone(),
        accounts: snapshot.accounts.len(),
        banners: snapshot.banners.len(),
        warp_items: snapshot.warp_items.len(),
        import_batches: snapshot.import_batches.len(),
        warp_pulls: snapshot.warp_pulls.len(),
        warp_pulls_inserted,
        duplicate_warp_pulls,
        recomputed_banners,
    })
}

fn record_cloud_backup_snapshot_to_database(
    connection: &mut Connection,
    input: &RecordCloudBackupSnapshotInput,
) -> Result<RecordCloudBackupSnapshotResult, String> {
    validate_cloud_backup_snapshot_record(input)?;

    let snapshot_id = cloud_backup_snapshot_id(&input.provider, &input.remote_file_id);
    let event_id = create_cloud_backup_event_id()?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to start cloud backup audit transaction: {error}"))?;

    transaction
        .execute(
            "INSERT INTO cloud_backup_snapshots (
               id, provider, remote_file_id, file_name, remote_md5_checksum,
               remote_modified_time, size_bytes, last_operation, last_status,
               last_message, uploaded_at, restored_at, updated_at
             )
             VALUES (
               ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
               CASE WHEN ?8 = 'upload' THEN CURRENT_TIMESTAMP ELSE NULL END,
               CASE WHEN ?8 = 'restore' THEN CURRENT_TIMESTAMP ELSE NULL END,
               CURRENT_TIMESTAMP
             )
             ON CONFLICT(provider, remote_file_id) DO UPDATE SET
               file_name = excluded.file_name,
               remote_md5_checksum = COALESCE(
                 excluded.remote_md5_checksum,
                 cloud_backup_snapshots.remote_md5_checksum
               ),
               remote_modified_time = COALESCE(
                 excluded.remote_modified_time,
                 cloud_backup_snapshots.remote_modified_time
               ),
               size_bytes = COALESCE(
                 excluded.size_bytes,
                 cloud_backup_snapshots.size_bytes
               ),
               last_operation = excluded.last_operation,
               last_status = excluded.last_status,
               last_message = excluded.last_message,
               uploaded_at = CASE
                 WHEN excluded.last_operation = 'upload' THEN CURRENT_TIMESTAMP
                 ELSE cloud_backup_snapshots.uploaded_at
               END,
               restored_at = CASE
                 WHEN excluded.last_operation = 'restore' THEN CURRENT_TIMESTAMP
                 ELSE cloud_backup_snapshots.restored_at
               END,
               updated_at = CURRENT_TIMESTAMP",
            params![
                &snapshot_id,
                &input.provider,
                &input.remote_file_id,
                &input.file_name,
                input.remote_md5_checksum.as_deref(),
                input.remote_modified_time.as_deref(),
                input.size_bytes,
                &input.operation,
                &input.status,
                input.message.as_deref(),
            ],
        )
        .map_err(|error| {
            format!(
                "Failed to upsert cloud backup snapshot {}: {error}",
                input.remote_file_id
            )
        })?;

    transaction
        .execute(
            "INSERT INTO cloud_backup_events (
               id, provider, remote_file_id, file_name, operation, status, message
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                &event_id,
                &input.provider,
                &input.remote_file_id,
                &input.file_name,
                &input.operation,
                &input.status,
                input.message.as_deref(),
            ],
        )
        .map_err(|error| {
            format!(
                "Failed to insert cloud backup event for {}: {error}",
                input.remote_file_id
            )
        })?;

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit cloud backup audit transaction: {error}"))?;

    let total_events = count_cloud_backup_events(connection)?;

    Ok(RecordCloudBackupSnapshotResult {
        snapshot_id,
        event_id,
        total_events,
    })
}

fn get_cloud_backup_policy_from_database(
    connection: &mut Connection,
    provider: &str,
) -> Result<CloudBackupPolicy, String> {
    validate_cloud_backup_provider(provider)?;
    ensure_cloud_backup_policy(connection, provider)?;

    read_cloud_backup_policy(connection, provider)
}

fn update_cloud_backup_policy_in_database(
    connection: &mut Connection,
    input: &UpdateCloudBackupPolicyInput,
) -> Result<CloudBackupPolicy, String> {
    validate_cloud_backup_provider(&input.provider)?;

    connection
        .execute(
            "INSERT INTO cloud_backup_policies (
               provider, auto_backup_enabled, trigger_name, min_interval_minutes, updated_at
             )
             VALUES (?1, ?2, ?3, 0, CURRENT_TIMESTAMP)
             ON CONFLICT(provider) DO UPDATE SET
               auto_backup_enabled = excluded.auto_backup_enabled,
               trigger_name = excluded.trigger_name,
               updated_at = CURRENT_TIMESTAMP",
            params![
                &input.provider,
                input.auto_backup_enabled,
                MANUAL_IMPORT_SAVED_TRIGGER,
            ],
        )
        .map_err(|error| {
            format!(
                "Failed to update cloud backup policy for {}: {error}",
                input.provider
            )
        })?;

    read_cloud_backup_policy(connection, &input.provider)
}

fn ensure_cloud_backup_policy(connection: &Connection, provider: &str) -> Result<(), String> {
    connection
        .execute(
            "INSERT OR IGNORE INTO cloud_backup_policies (
               provider, auto_backup_enabled, trigger_name, min_interval_minutes
             )
             VALUES (?1, 0, ?2, 0)",
            params![provider, MANUAL_IMPORT_SAVED_TRIGGER],
        )
        .map_err(|error| format!("Failed to ensure cloud backup policy for {provider}: {error}"))?;

    Ok(())
}

fn read_cloud_backup_policy(
    connection: &Connection,
    provider: &str,
) -> Result<CloudBackupPolicy, String> {
    connection
        .query_row(
            "SELECT provider, auto_backup_enabled, trigger_name, min_interval_minutes, updated_at
             FROM cloud_backup_policies
             WHERE provider = ?1",
            params![provider],
            |row| {
                Ok(CloudBackupPolicy {
                    provider: row.get(0)?,
                    auto_backup_enabled: row.get(1)?,
                    trigger_name: row.get(2)?,
                    min_interval_minutes: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
        .map_err(|error| format!("Failed to read cloud backup policy for {provider}: {error}"))
}

fn build_backup_snapshot(connection: &Connection) -> Result<BackupSnapshot, String> {
    Ok(BackupSnapshot {
        schema_version: BACKUP_SCHEMA_VERSION,
        application: "warp-tracker".to_string(),
        exported_at: current_database_timestamp(connection)?,
        applied_migrations: list_applied_migrations(connection)?,
        accounts: read_backup_accounts(connection)?,
        banners: read_backup_banners(connection)?,
        warp_items: read_backup_warp_items(connection)?,
        import_batches: read_backup_import_batches(connection)?,
        warp_pulls: read_backup_warp_pulls(connection)?,
    })
}

fn read_backup_accounts(connection: &Connection) -> Result<Vec<BackupAccountRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, uid, region, nickname, created_at, updated_at
             FROM accounts
             ORDER BY uid, COALESCE(region, ''), id",
        )
        .map_err(|error| format!("Failed to prepare account backup query: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(BackupAccountRow {
                id: row.get(0)?,
                uid: row.get(1)?,
                region: row.get(2)?,
                nickname: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|error| format!("Failed to query account backup rows: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode account backup rows: {error}"))
}

fn read_backup_banners(connection: &Connection) -> Result<Vec<BackupBannerRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, banner_type, name, version, started_at, ended_at, created_at, updated_at
             FROM banners
             ORDER BY banner_type, COALESCE(version, ''), name, id",
        )
        .map_err(|error| format!("Failed to prepare banner backup query: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(BackupBannerRow {
                id: row.get(0)?,
                banner_type: row.get(1)?,
                name: row.get(2)?,
                version: row.get(3)?,
                started_at: row.get(4)?,
                ended_at: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| format!("Failed to query banner backup rows: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode banner backup rows: {error}"))
}

fn read_backup_warp_items(connection: &Connection) -> Result<Vec<BackupWarpItemRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, source_id, name, item_type, rarity, icon_path, preview_path,
                    portrait_path, updated_at
             FROM warp_items
             ORDER BY item_type, rarity DESC, name, id",
        )
        .map_err(|error| format!("Failed to prepare item backup query: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(BackupWarpItemRow {
                id: row.get(0)?,
                source_id: row.get(1)?,
                name: row.get(2)?,
                item_type: row.get(3)?,
                rarity: row.get(4)?,
                icon_path: row.get(5)?,
                preview_path: row.get(6)?,
                portrait_path: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|error| format!("Failed to query item backup rows: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode item backup rows: {error}"))
}

fn read_backup_import_batches(
    connection: &Connection,
) -> Result<Vec<BackupImportBatchRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, account_id, source, banner_type, started_at, finished_at,
                    records_found, records_inserted, records_skipped, status, notes
             FROM import_batches
             ORDER BY started_at, id",
        )
        .map_err(|error| format!("Failed to prepare import batch backup query: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(BackupImportBatchRow {
                id: row.get(0)?,
                account_id: row.get(1)?,
                source: row.get(2)?,
                banner_type: row.get(3)?,
                started_at: row.get(4)?,
                finished_at: row.get(5)?,
                records_found: row.get(6)?,
                records_inserted: row.get(7)?,
                records_skipped: row.get(8)?,
                status: row.get(9)?,
                notes: row.get(10)?,
            })
        })
        .map_err(|error| format!("Failed to query import batch backup rows: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode import batch backup rows: {error}"))
}

fn read_backup_warp_pulls(connection: &Connection) -> Result<Vec<BackupWarpPullRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, account_id, banner_id, warp_item_id, pulled_at, pulled_at_timezone,
                    gacha_id, source, source_import_id, source_line_number,
                    sequence_in_timestamp_group, raw_item_name, pity_4, pity_5, created_at
             FROM warp_pulls
             ORDER BY account_id, banner_id, pulled_at, sequence_in_timestamp_group, id",
        )
        .map_err(|error| format!("Failed to prepare warp pull backup query: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(BackupWarpPullRow {
                id: row.get(0)?,
                account_id: row.get(1)?,
                banner_id: row.get(2)?,
                warp_item_id: row.get(3)?,
                pulled_at: row.get(4)?,
                pulled_at_timezone: row.get(5)?,
                gacha_id: row.get(6)?,
                source: row.get(7)?,
                source_import_id: row.get(8)?,
                source_line_number: row.get(9)?,
                sequence_in_timestamp_group: row.get(10)?,
                raw_item_name: row.get(11)?,
                pity_4: row.get(12)?,
                pity_5: row.get(13)?,
                created_at: row.get(14)?,
            })
        })
        .map_err(|error| format!("Failed to query warp pull backup rows: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode warp pull backup rows: {error}"))
}

fn restore_backup_accounts(
    transaction: &Transaction<'_>,
    accounts: &[BackupAccountRow],
) -> Result<(), String> {
    let mut statement = transaction
        .prepare(
            "INSERT INTO accounts (id, uid, region, nickname, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
               uid = excluded.uid,
               region = excluded.region,
               nickname = excluded.nickname,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at",
        )
        .map_err(|error| format!("Failed to prepare account restore statement: {error}"))?;

    for account in accounts {
        statement
            .execute(params![
                &account.id,
                &account.uid,
                account.region.as_deref(),
                account.nickname.as_deref(),
                &account.created_at,
                &account.updated_at,
            ])
            .map_err(|error| format!("Failed to restore account {}: {error}", account.uid))?;
    }

    Ok(())
}

fn restore_backup_banners(
    transaction: &Transaction<'_>,
    banners: &[BackupBannerRow],
) -> Result<(), String> {
    let mut statement = transaction
        .prepare(
            "INSERT INTO banners (
               id, banner_type, name, version, started_at, ended_at, created_at, updated_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
               banner_type = excluded.banner_type,
               name = excluded.name,
               version = excluded.version,
               started_at = excluded.started_at,
               ended_at = excluded.ended_at,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at",
        )
        .map_err(|error| format!("Failed to prepare banner restore statement: {error}"))?;

    for banner in banners {
        statement
            .execute(params![
                &banner.id,
                &banner.banner_type,
                &banner.name,
                banner.version.as_deref(),
                banner.started_at.as_deref(),
                banner.ended_at.as_deref(),
                &banner.created_at,
                &banner.updated_at,
            ])
            .map_err(|error| format!("Failed to restore banner {}: {error}", banner.id))?;
    }

    Ok(())
}

fn restore_backup_warp_items(
    transaction: &Transaction<'_>,
    warp_items: &[BackupWarpItemRow],
) -> Result<(), String> {
    let mut statement = transaction
        .prepare(
            "INSERT INTO warp_items (
               id, source_id, name, item_type, rarity, icon_path, preview_path, portrait_path,
               updated_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               source_id = excluded.source_id,
               name = excluded.name,
               item_type = excluded.item_type,
               rarity = excluded.rarity,
               icon_path = excluded.icon_path,
               preview_path = excluded.preview_path,
               portrait_path = excluded.portrait_path,
               updated_at = excluded.updated_at",
        )
        .map_err(|error| format!("Failed to prepare item restore statement: {error}"))?;

    for item in warp_items {
        statement
            .execute(params![
                &item.id,
                item.source_id.as_deref(),
                &item.name,
                &item.item_type,
                item.rarity,
                item.icon_path.as_deref(),
                item.preview_path.as_deref(),
                item.portrait_path.as_deref(),
                &item.updated_at,
            ])
            .map_err(|error| format!("Failed to restore item {}: {error}", item.id))?;
    }

    Ok(())
}

fn restore_backup_import_batches(
    transaction: &Transaction<'_>,
    import_batches: &[BackupImportBatchRow],
) -> Result<(), String> {
    let mut statement = transaction
        .prepare(
            "INSERT INTO import_batches (
               id, account_id, source, banner_type, started_at, finished_at, records_found,
               records_inserted, records_skipped, status, notes
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
               account_id = excluded.account_id,
               source = excluded.source,
               banner_type = excluded.banner_type,
               started_at = excluded.started_at,
               finished_at = excluded.finished_at,
               records_found = excluded.records_found,
               records_inserted = excluded.records_inserted,
               records_skipped = excluded.records_skipped,
               status = excluded.status,
               notes = excluded.notes",
        )
        .map_err(|error| format!("Failed to prepare import batch restore statement: {error}"))?;

    for batch in import_batches {
        statement
            .execute(params![
                &batch.id,
                &batch.account_id,
                &batch.source,
                batch.banner_type.as_deref(),
                &batch.started_at,
                batch.finished_at.as_deref(),
                batch.records_found,
                batch.records_inserted,
                batch.records_skipped,
                &batch.status,
                batch.notes.as_deref(),
            ])
            .map_err(|error| format!("Failed to restore import batch {}: {error}", batch.id))?;
    }

    Ok(())
}

fn restore_backup_warp_pulls(
    transaction: &Transaction<'_>,
    warp_pulls: &[BackupWarpPullRow],
) -> Result<(usize, usize), String> {
    let mut statement = transaction
        .prepare(
            "INSERT OR IGNORE INTO warp_pulls (
               id, account_id, banner_id, warp_item_id, pulled_at, pulled_at_timezone,
               gacha_id, source, source_import_id, source_line_number,
               sequence_in_timestamp_group, raw_item_name, pity_4, pity_5, created_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        )
        .map_err(|error| format!("Failed to prepare warp pull restore statement: {error}"))?;
    let mut inserted = 0;
    let mut duplicate = 0;

    for pull in warp_pulls {
        let affected_rows = statement
            .execute(params![
                &pull.id,
                &pull.account_id,
                &pull.banner_id,
                &pull.warp_item_id,
                &pull.pulled_at,
                pull.pulled_at_timezone.as_deref(),
                pull.gacha_id.as_deref(),
                &pull.source,
                pull.source_import_id.as_deref(),
                pull.source_line_number,
                pull.sequence_in_timestamp_group,
                pull.raw_item_name.as_deref(),
                pull.pity_4,
                pull.pity_5,
                &pull.created_at,
            ])
            .map_err(|error| format!("Failed to restore warp pull {}: {error}", pull.id))?;

        if affected_rows == 1 {
            inserted += 1;
        } else {
            duplicate += 1;
        }
    }

    Ok((inserted, duplicate))
}

fn recompute_pity_for_snapshot(
    transaction: &Transaction<'_>,
    snapshot: &BackupSnapshot,
) -> Result<usize, String> {
    let account_banner_pairs = snapshot
        .warp_pulls
        .iter()
        .map(|pull| (pull.account_id.as_str(), pull.banner_id.as_str()))
        .collect::<HashSet<_>>();

    for (account_id, banner_id) in &account_banner_pairs {
        recompute_pity_for_account_banner(transaction, account_id, banner_id)?;
    }

    Ok(account_banner_pairs.len())
}

fn validate_backup_snapshot(snapshot: &BackupSnapshot) -> Result<(), String> {
    if snapshot.application != "warp-tracker" {
        return Err("Backup snapshot was not created by Warp Tracker.".to_string());
    }

    if snapshot.schema_version != BACKUP_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported backup schema version {}.",
            snapshot.schema_version
        ));
    }

    Ok(())
}

fn validate_cloud_backup_snapshot_record(
    input: &RecordCloudBackupSnapshotInput,
) -> Result<(), String> {
    validate_cloud_backup_provider(&input.provider)?;

    if input.remote_file_id.trim().is_empty() {
        return Err("Cloud backup remote file id cannot be empty.".to_string());
    }

    if input.file_name.trim().is_empty() {
        return Err("Cloud backup file name cannot be empty.".to_string());
    }

    if !matches!(input.operation.as_str(), "upload" | "restore") {
        return Err(format!(
            "Unsupported cloud backup operation {}.",
            input.operation
        ));
    }

    if !matches!(input.status.as_str(), "success" | "failed") {
        return Err(format!("Unsupported cloud backup status {}.", input.status));
    }

    if matches!(input.size_bytes, Some(size_bytes) if size_bytes < 0) {
        return Err("Cloud backup size cannot be negative.".to_string());
    }

    Ok(())
}

fn validate_cloud_backup_provider(provider: &str) -> Result<(), String> {
    if provider != GOOGLE_DRIVE_PROVIDER {
        return Err(format!("Unsupported cloud backup provider {provider}."));
    }

    Ok(())
}

fn list_backup_snapshots_in_directory(
    backup_directory: &Path,
) -> Result<Vec<BackupSnapshotSummary>, String> {
    if !backup_directory.exists() {
        return Ok(Vec::new());
    }

    let mut snapshots = Vec::new();

    for entry in fs::read_dir(backup_directory)
        .map_err(|error| format!("Failed to read backup directory: {error}"))?
    {
        let path = entry
            .map_err(|error| format!("Failed to read backup directory entry: {error}"))?
            .path();

        if !is_backup_snapshot_file(&path) {
            continue;
        }

        if let Ok(summary) = read_backup_snapshot_summary(&path) {
            snapshots.push(summary);
        }
    }

    snapshots.sort_by(|left, right| right.file_name.cmp(&left.file_name));

    Ok(snapshots)
}

fn read_backup_snapshot_summary(path: &Path) -> Result<BackupSnapshotSummary, String> {
    let payload = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read backup snapshot: {error}"))?;
    let snapshot: BackupSnapshot = serde_json::from_str(&payload)
        .map_err(|error| format!("Failed to parse backup snapshot: {error}"))?;

    validate_backup_snapshot(&snapshot)?;

    Ok(BackupSnapshotSummary {
        backup_path: path.to_string_lossy().to_string(),
        file_name: path
            .file_name()
            .and_then(|file_name| file_name.to_str())
            .unwrap_or("backup.json")
            .to_string(),
        exported_at: snapshot.exported_at,
        accounts: snapshot.accounts.len(),
        banners: snapshot.banners.len(),
        warp_items: snapshot.warp_items.len(),
        import_batches: snapshot.import_batches.len(),
        warp_pulls: snapshot.warp_pulls.len(),
    })
}

fn find_latest_backup_snapshot_path(backup_directory: &Path) -> Result<PathBuf, String> {
    let snapshots = list_backup_snapshots_in_directory(backup_directory)?;

    snapshots
        .first()
        .map(|snapshot| PathBuf::from(&snapshot.backup_path))
        .ok_or_else(|| "No local backup snapshots found yet.".to_string())
}

fn delete_backup_snapshot_file(
    backup_directory: &Path,
    backup_path: &Path,
) -> Result<DeleteBackupSnapshotResult, String> {
    let file_name = backup_path
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .ok_or_else(|| "Backup snapshot file name is invalid.".to_string())?
        .to_string();
    let backup_path_string = backup_path.to_string_lossy().to_string();

    fs::remove_file(backup_path)
        .map_err(|error| format!("Failed to delete backup snapshot: {error}"))?;

    let remaining_snapshots = list_backup_snapshots_in_directory(backup_directory)?.len();

    Ok(DeleteBackupSnapshotResult {
        backup_path: backup_path_string,
        file_name,
        remaining_snapshots,
    })
}

fn read_backup_snapshot_file(backup_path: &Path) -> Result<BackupSnapshotFile, String> {
    let file_name = backup_path
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .ok_or_else(|| "Backup snapshot file name is invalid.".to_string())?
        .to_string();
    let bytes = fs::read(backup_path)
        .map_err(|error| format!("Failed to read local backup snapshot: {error}"))?;

    Ok(BackupSnapshotFile {
        backup_path: backup_path.to_string_lossy().to_string(),
        file_name,
        bytes,
    })
}

fn resolve_backup_snapshot_path(
    backup_directory: &Path,
    file_name: &str,
) -> Result<PathBuf, String> {
    if !is_plain_file_name(file_name) {
        return Err("Backup snapshot file name is invalid.".to_string());
    }

    let backup_path = backup_directory.join(file_name);

    if !is_backup_snapshot_file(&backup_path) {
        return Err("Backup snapshot file name is invalid.".to_string());
    }

    if !backup_path.exists() {
        return Err("Backup snapshot file was not found.".to_string());
    }

    read_backup_snapshot_summary(&backup_path)?;

    Ok(backup_path)
}

fn is_plain_file_name(file_name: &str) -> bool {
    !file_name.trim().is_empty()
        && Path::new(file_name)
            .file_name()
            .and_then(|name| name.to_str())
            == Some(file_name)
}

fn is_backup_snapshot_file(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|file_name| file_name.to_str()) else {
        return false;
    };

    file_name.starts_with("warp-tracker-backup-")
        && path.extension().and_then(|extension| extension.to_str()) == Some("json")
}

fn current_database_timestamp(connection: &Connection) -> Result<String, String> {
    connection
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })
        .map_err(|error| format!("Failed to create backup timestamp: {error}"))
}

fn create_backup_file_name() -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before UNIX epoch: {error}"))?
        .as_nanos();

    Ok(format!("warp-tracker-backup-{timestamp}.json"))
}

fn validate_list_warp_pulls_query(query: &ListWarpPullsInput) -> Result<(), String> {
    if query.account_id.trim().is_empty() {
        return Err("Warp pull query account id cannot be empty.".to_string());
    }

    if let Some(banner_type) = &query.banner_type {
        banner_label(banner_type)?;
    }

    if matches!(query.limit, Some(0)) {
        return Err("Warp pull query limit must be greater than zero.".to_string());
    }

    Ok(())
}

fn query_limit(query: &ListWarpPullsInput) -> usize {
    query.limit.unwrap_or(100).clamp(1, 500)
}

fn map_warp_pull_row(row: &Row<'_>) -> rusqlite::Result<WarpPullRow> {
    Ok(WarpPullRow {
        id: row.get(0)?,
        banner_type: row.get(1)?,
        item_name: row.get(2)?,
        item_type: row.get(3)?,
        rarity: row.get(4)?,
        pulled_at: row.get(5)?,
        source: row.get(6)?,
        pity_four_at_pull: row.get(7)?,
        pity_five_at_pull: row.get(8)?,
    })
}

fn recompute_pity_for_account_banner(
    transaction: &Transaction<'_>,
    account_id: &str,
    banner_id: &str,
) -> Result<(), String> {
    let pull_rows = {
        let mut statement = transaction
            .prepare(
                "SELECT wp.id, wi.rarity
                 FROM warp_pulls wp
                 INNER JOIN warp_items wi ON wi.id = wp.warp_item_id
                 WHERE wp.account_id = ?1 AND wp.banner_id = ?2
                 ORDER BY wp.pulled_at ASC, wp.sequence_in_timestamp_group ASC, wp.id ASC",
            )
            .map_err(|error| format!("Failed to prepare pity recompute query: {error}"))?;
        let rows = statement
            .query_map(params![account_id, banner_id], |row| {
                Ok(WarpPullPityCandidate {
                    id: row.get(0)?,
                    rarity: row.get(1)?,
                })
            })
            .map_err(|error| format!("Failed to query pulls for pity recompute: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Failed to decode pulls for pity recompute: {error}"))?
    };

    let mut update_statement = transaction
        .prepare("UPDATE warp_pulls SET pity_4 = ?2, pity_5 = ?3 WHERE id = ?1")
        .map_err(|error| format!("Failed to prepare pity update statement: {error}"))?;
    let mut four_star_pity = 0;
    let mut five_star_pity = 0;

    for pull in pull_rows {
        four_star_pity += 1;
        five_star_pity += 1;

        let pity_four_at_pull = if pull.rarity >= 4 {
            Some(four_star_pity)
        } else {
            None
        };
        let pity_five_at_pull = if pull.rarity == 5 {
            Some(five_star_pity)
        } else {
            None
        };

        update_statement
            .execute(params![&pull.id, pity_four_at_pull, pity_five_at_pull,])
            .map_err(|error| format!("Failed to update pity for pull {}: {error}", pull.id))?;

        if pull.rarity == 5 {
            four_star_pity = 0;
            five_star_pity = 0;
        } else if pull.rarity == 4 {
            four_star_pity = 0;
        }
    }

    Ok(())
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

fn validate_manual_import_draft(draft: &SaveManualImportDraftInput) -> Result<(), String> {
    if draft.status != "ready" {
        return Err("Manual import draft must be ready before saving.".to_string());
    }

    if draft.issues_count > 0 {
        return Err("Manual import draft still has review issues.".to_string());
    }

    if draft.records_skipped > 0 {
        return Err("Manual import draft has skipped records before database dedupe.".to_string());
    }

    if draft.records_ready != draft.pulls.len() {
        return Err(format!(
            "Manual import draft expected {} ready records but received {} pulls.",
            draft.records_ready,
            draft.pulls.len()
        ));
    }

    if draft.records_found < draft.records_ready {
        return Err(
            "Manual import draft recordsFound cannot be smaller than recordsReady.".to_string(),
        );
    }

    if draft.account.id.trim().is_empty() {
        return Err("Manual import account id cannot be empty.".to_string());
    }

    if draft.account.uid.trim().is_empty() {
        return Err("Manual import account UID cannot be empty.".to_string());
    }

    if draft.pulls.is_empty() {
        return Err("Manual import draft does not contain any pull.".to_string());
    }

    for pull in &draft.pulls {
        validate_manual_import_pull(pull)?;
    }

    Ok(())
}

fn validate_manual_import_pull(pull: &SaveManualImportDraftPullInput) -> Result<(), String> {
    banner_label(&pull.banner_type)?;

    if pull.warp_item_id.trim().is_empty() {
        return Err("Manual import pull warp item id cannot be empty.".to_string());
    }

    if pull.pulled_at.trim().is_empty() {
        return Err(format!(
            "Manual import pull {} does not have a timestamp.",
            pull.raw_item_name
        ));
    }

    if pull.source_line_number < 1 {
        return Err(format!(
            "Manual import pull {} has invalid source line number.",
            pull.raw_item_name
        ));
    }

    if pull.sequence_in_timestamp_group < 1 {
        return Err(format!(
            "Manual import pull {} has invalid timestamp group sequence.",
            pull.raw_item_name
        ));
    }

    if pull.raw_item_name.trim().is_empty() {
        return Err("Manual import pull raw item name cannot be empty.".to_string());
    }

    Ok(())
}

fn upsert_account(
    transaction: &Transaction<'_>,
    account: &ManualImportAccountInput,
) -> Result<(), String> {
    transaction
        .execute(
            "INSERT INTO accounts (id, uid, region, nickname, updated_at)
             VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
               uid = excluded.uid,
               region = excluded.region,
               nickname = excluded.nickname,
               updated_at = CURRENT_TIMESTAMP",
            params![
                &account.id,
                &account.uid,
                account.region.as_deref(),
                account.nickname.as_deref(),
            ],
        )
        .map_err(|error| format!("Failed to upsert account {}: {error}", account.id))?;

    Ok(())
}

fn ensure_banner(transaction: &Transaction<'_>, banner_type: &str) -> Result<String, String> {
    let banner_id = banner_id_for_type(banner_type);
    let banner_name = banner_label(banner_type)?;

    transaction
        .execute(
            "INSERT INTO banners (id, banner_type, name, updated_at)
             VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
               banner_type = excluded.banner_type,
               name = excluded.name,
               updated_at = CURRENT_TIMESTAMP",
            params![&banner_id, banner_type, banner_name],
        )
        .map_err(|error| format!("Failed to ensure banner {banner_type}: {error}"))?;

    Ok(banner_id)
}

fn insert_import_batch(
    transaction: &Transaction<'_>,
    import_batch_id: &str,
    account_id: &str,
    banner_type: Option<&str>,
    records_found: usize,
) -> Result<(), String> {
    transaction
        .execute(
            "INSERT INTO import_batches (
               id, account_id, source, banner_type, records_found, records_inserted,
               records_skipped, status
             )
             VALUES (?1, ?2, 'manual', ?3, ?4, 0, 0, 'pending')",
            params![
                import_batch_id,
                account_id,
                banner_type,
                records_found as i64
            ],
        )
        .map_err(|error| format!("Failed to insert manual import batch: {error}"))?;

    Ok(())
}

fn update_import_batch_result(
    transaction: &Transaction<'_>,
    import_batch_id: &str,
    records_inserted: usize,
    records_skipped: usize,
) -> Result<(), String> {
    transaction
        .execute(
            "UPDATE import_batches
             SET finished_at = CURRENT_TIMESTAMP,
                 records_inserted = ?2,
                 records_skipped = ?3,
                 status = 'completed'
             WHERE id = ?1",
            params![
                import_batch_id,
                records_inserted as i64,
                records_skipped as i64,
            ],
        )
        .map_err(|error| format!("Failed to update manual import batch result: {error}"))?;

    Ok(())
}

fn banner_id_for_type(banner_type: &str) -> String {
    format!("banner-{banner_type}")
}

fn banner_label(banner_type: &str) -> Result<&'static str, String> {
    match banner_type {
        "departure" => Ok("Departure"),
        "standard" => Ok("Standard"),
        "character_event" => Ok("Character Event"),
        "light_cone_event" => Ok("Light Cone Event"),
        "collaboration_character" => Ok("Collab Character"),
        "collaboration_light_cone" => Ok("Collab Light Cone"),
        _ => Err(format!("Unsupported banner type {banner_type}.")),
    }
}

fn create_import_batch_id() -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before UNIX epoch: {error}"))?
        .as_nanos();

    Ok(format!("manual-import-{timestamp}"))
}

fn create_cloud_backup_event_id() -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before UNIX epoch: {error}"))?
        .as_nanos();

    Ok(format!("cloud-backup-event-{timestamp}"))
}

fn cloud_backup_snapshot_id(provider: &str, remote_file_id: &str) -> String {
    format!("cloud-backup:{provider}:{remote_file_id}")
}

fn manual_pull_id(
    account_id: &str,
    banner_id: &str,
    pulled_at: &str,
    warp_item_id: &str,
    sequence_in_timestamp_group: i64,
) -> String {
    format!(
        "manual:{account_id}:{banner_id}:{pulled_at}:{warp_item_id}:{sequence_in_timestamp_group}"
    )
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

fn count_cloud_backup_events(connection: &Connection) -> Result<i64, String> {
    connection
        .query_row("SELECT COUNT(*) FROM cloud_backup_events", [], |row| {
            row.get(0)
        })
        .map_err(|error| format!("Failed to count cloud backup events: {error}"))
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
    fn applies_migrations() {
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
        let unique_name_index_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'ux_warp_items_name'",
                [],
                |row| row.get(0),
            )
            .expect("unique warp item name index count");
        let name_index_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'ix_warp_items_name'",
                [],
                |row| row.get(0),
            )
            .expect("warp item name index count");
        let cloud_snapshot_table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'cloud_backup_snapshots'",
                [],
                |row| row.get(0),
            )
            .expect("cloud backup snapshots table count");
        let cloud_event_table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'cloud_backup_events'",
                [],
                |row| row.get(0),
            )
            .expect("cloud backup events table count");
        let cloud_policy_table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'cloud_backup_policies'",
                [],
                |row| row.get(0),
            )
            .expect("cloud backup policies table count");

        assert_eq!(applied_migrations, planned_migrations());
        assert_eq!(table_count, 1);
        assert_eq!(unique_name_index_count, 0);
        assert_eq!(name_index_count, 1);
        assert_eq!(cloud_snapshot_table_count, 1);
        assert_eq!(cloud_event_table_count, 1);
        assert_eq!(cloud_policy_table_count, 1);
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
    fn allows_catalog_items_with_duplicate_names() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");

        let result = upsert_warp_item_catalog(
            &mut connection,
            &[
                catalog_item("character-1001", "1001", "March 7th", "character", 4),
                catalog_item("character-1224", "1224", "March 7th", "character", 4),
            ],
        )
        .expect("catalog sync with duplicate names");

        assert_eq!(result.inserted, 2);
        assert_eq!(result.total_in_database, 2);
    }

    #[test]
    fn does_not_rerun_applied_migrations_with_duplicate_item_names() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("initial migration applies");
        upsert_warp_item_catalog(
            &mut connection,
            &[
                catalog_item("character-1001", "1001", "March 7th", "character", 4),
                catalog_item("character-1224", "1224", "March 7th", "character", 4),
            ],
        )
        .expect("duplicate names can be synced after migration 0002");

        apply_migrations(&connection).expect("applied migrations are skipped");

        assert_eq!(count_table(&connection, "warp_items"), 2);
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

    #[test]
    fn saves_manual_import_draft_and_deduplicates_pulls() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");
        upsert_warp_item_catalog(
            &mut connection,
            &[
                catalog_item("character-1001", "1001", "Pela", "character", 4),
                catalog_item("light-cone-2001", "2001", "Data Bank", "light_cone", 3),
            ],
        )
        .expect("catalog sync");

        let first = save_manual_import_draft_to_database(&mut connection, &manual_import_draft())
            .expect("first manual import");
        let second = save_manual_import_draft_to_database(&mut connection, &manual_import_draft())
            .expect("second manual import");

        assert_eq!(first.records_found, 2);
        assert_eq!(first.records_inserted, 2);
        assert_eq!(first.records_skipped, 0);
        assert_eq!(first.duplicate_records, 0);
        assert_eq!(first.banner_count, 1);
        assert_eq!(second.records_inserted, 0);
        assert_eq!(second.records_skipped, 2);
        assert_eq!(second.duplicate_records, 2);
        assert_eq!(count_table(&connection, "accounts"), 1);
        assert_eq!(count_table(&connection, "banners"), 1);
        assert_eq!(count_table(&connection, "import_batches"), 2);
        assert_eq!(count_table(&connection, "warp_pulls"), 2);
    }

    #[test]
    fn exports_backup_snapshot_to_json_file() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");
        upsert_warp_item_catalog(
            &mut connection,
            &[
                catalog_item("character-1001", "1001", "Pela", "character", 4),
                catalog_item("light-cone-2001", "2001", "Data Bank", "light_cone", 3),
            ],
        )
        .expect("catalog sync");
        save_manual_import_draft_to_database(&mut connection, &manual_import_draft())
            .expect("manual import");

        let backup_directory = unique_test_dir("backup-export");
        let result = export_backup_snapshot_to_directory(&connection, &backup_directory)
            .expect("backup export");
        let backup_path = PathBuf::from(&result.backup_path);
        let payload = std::fs::read_to_string(&backup_path).expect("backup file can be read");
        let snapshot: serde_json::Value =
            serde_json::from_str(&payload).expect("backup file is valid json");
        let snapshots = list_backup_snapshots_in_directory(&backup_directory).expect("backup list");

        assert!(backup_path.exists());
        assert_eq!(result.accounts, 1);
        assert_eq!(result.banners, 1);
        assert_eq!(result.warp_items, 2);
        assert_eq!(result.import_batches, 1);
        assert_eq!(result.warp_pulls, 2);
        assert_eq!(
            snapshot["schemaVersion"].as_i64(),
            Some(BACKUP_SCHEMA_VERSION)
        );
        assert_eq!(snapshot["accounts"][0]["uid"].as_str(), Some("800000001"));
        assert_eq!(snapshot["warpPulls"].as_array().map(Vec::len), Some(2));
        assert_eq!(snapshots.len(), 1);
        assert_eq!(snapshots[0].warp_pulls, 2);
        assert_eq!(snapshots[0].backup_path, result.backup_path);

        std::fs::remove_dir_all(backup_directory).ok();
    }

    #[test]
    fn deletes_backup_snapshot_file_after_validation() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");
        upsert_warp_item_catalog(
            &mut connection,
            &[
                catalog_item("character-1001", "1001", "Pela", "character", 4),
                catalog_item("light-cone-2001", "2001", "Data Bank", "light_cone", 3),
            ],
        )
        .expect("catalog sync");
        save_manual_import_draft_to_database(&mut connection, &manual_import_draft())
            .expect("manual import");

        let backup_directory = unique_test_dir("backup-delete");
        let export_result = export_backup_snapshot_to_directory(&connection, &backup_directory)
            .expect("backup export");
        let backup_path = PathBuf::from(&export_result.backup_path);
        let delete_result =
            delete_backup_snapshot_file(&backup_directory, &backup_path).expect("backup delete");

        assert_eq!(delete_result.remaining_snapshots, 0);
        assert_eq!(
            delete_result.file_name,
            backup_path
                .file_name()
                .and_then(|file_name| file_name.to_str())
                .expect("backup file name")
        );
        assert!(!backup_path.exists());

        std::fs::remove_dir_all(backup_directory).ok();
    }

    #[test]
    fn restores_backup_snapshot_and_skips_duplicate_pulls() {
        let mut source_connection = Connection::open_in_memory().expect("source database");
        apply_migrations(&source_connection).expect("source migration applies");
        upsert_warp_item_catalog(
            &mut source_connection,
            &[
                catalog_item("character-1001", "1001", "Pela", "character", 4),
                catalog_item("light-cone-2001", "2001", "Data Bank", "light_cone", 3),
            ],
        )
        .expect("source catalog sync");
        save_manual_import_draft_to_database(&mut source_connection, &manual_import_draft())
            .expect("source manual import");

        let backup_directory = unique_test_dir("backup-restore");
        let export_result =
            export_backup_snapshot_to_directory(&source_connection, &backup_directory)
                .expect("backup export");
        let backup_path = PathBuf::from(export_result.backup_path);
        let backup_file_name = backup_path
            .file_name()
            .and_then(|file_name| file_name.to_str())
            .expect("backup file name")
            .to_string();
        let resolved_backup_path =
            resolve_backup_snapshot_path(&backup_directory, &backup_file_name)
                .expect("backup path resolves by file name");
        let mut target_connection = Connection::open_in_memory().expect("target database");
        apply_migrations(&target_connection).expect("target migration applies");

        let first_restore =
            restore_backup_snapshot_from_file(&mut target_connection, &resolved_backup_path)
                .expect("first restore");
        let second_restore =
            restore_backup_snapshot_from_file(&mut target_connection, &backup_path)
                .expect("second restore skips duplicates");
        let restored_pulls = list_warp_pulls_from_database(
            &target_connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: Some("character_event".to_string()),
                limit: Some(10),
            },
        )
        .expect("restored pulls can be listed");

        assert_eq!(first_restore.accounts, 1);
        assert_eq!(first_restore.warp_pulls, 2);
        assert_eq!(first_restore.warp_pulls_inserted, 2);
        assert_eq!(first_restore.duplicate_warp_pulls, 0);
        assert_eq!(first_restore.recomputed_banners, 1);
        assert_eq!(second_restore.warp_pulls_inserted, 0);
        assert_eq!(second_restore.duplicate_warp_pulls, 2);
        assert_eq!(count_table(&target_connection, "accounts"), 1);
        assert_eq!(count_table(&target_connection, "import_batches"), 1);
        assert_eq!(count_table(&target_connection, "warp_pulls"), 2);
        assert_eq!(restored_pulls[0].item_name, "Pela");
        assert_eq!(restored_pulls[0].pity_four_at_pull, Some(1));

        std::fs::remove_dir_all(backup_directory).ok();
    }

    #[test]
    fn restores_backup_snapshot_from_bytes_source() {
        let mut source_connection = Connection::open_in_memory().expect("source database");
        apply_migrations(&source_connection).expect("source migration applies");
        upsert_warp_item_catalog(
            &mut source_connection,
            &[
                catalog_item("character-1001", "1001", "Pela", "character", 4),
                catalog_item("light-cone-2001", "2001", "Data Bank", "light_cone", 3),
            ],
        )
        .expect("source catalog sync");
        save_manual_import_draft_to_database(&mut source_connection, &manual_import_draft())
            .expect("source manual import");

        let backup_directory = unique_test_dir("backup-restore-bytes");
        let export_result =
            export_backup_snapshot_to_directory(&source_connection, &backup_directory)
                .expect("backup export");
        let payload = std::fs::read(export_result.backup_path).expect("backup bytes");
        let mut target_connection = Connection::open_in_memory().expect("target database");
        apply_migrations(&target_connection).expect("target migration applies");

        let restore_result = restore_backup_snapshot_payload(
            &mut target_connection,
            "google-drive://remote-1/warp-tracker-backup.json",
            &payload,
        )
        .expect("bytes restore");

        assert_eq!(
            restore_result.backup_path,
            "google-drive://remote-1/warp-tracker-backup.json"
        );
        assert_eq!(restore_result.warp_pulls_inserted, 2);
        assert_eq!(count_table(&target_connection, "warp_pulls"), 2);

        std::fs::remove_dir_all(backup_directory).ok();
    }

    #[test]
    fn records_cloud_backup_snapshot_audit_and_preserves_metadata() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");

        let upload_result = record_cloud_backup_snapshot_to_database(
            &mut connection,
            &cloud_backup_record("upload", Some("checksum-1"), Some(2048)),
        )
        .expect("upload audit");
        let restore_result = record_cloud_backup_snapshot_to_database(
            &mut connection,
            &cloud_backup_record("restore", None, None),
        )
        .expect("restore audit");
        let snapshot_row = connection
            .query_row(
                "SELECT remote_md5_checksum, size_bytes, last_operation, uploaded_at IS NOT NULL,
                        restored_at IS NOT NULL
                 FROM cloud_backup_snapshots
                 WHERE provider = 'google_drive' AND remote_file_id = 'remote-1'",
                [],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<i64>>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, bool>(3)?,
                        row.get::<_, bool>(4)?,
                    ))
                },
            )
            .expect("snapshot audit row");

        assert_eq!(
            upload_result.snapshot_id,
            "cloud-backup:google_drive:remote-1"
        );
        assert_ne!(upload_result.event_id, restore_result.event_id);
        assert_eq!(restore_result.total_events, 2);
        assert_eq!(snapshot_row.0, Some("checksum-1".to_string()));
        assert_eq!(snapshot_row.1, Some(2048));
        assert_eq!(snapshot_row.2, "restore");
        assert!(snapshot_row.3);
        assert!(snapshot_row.4);
        assert_eq!(count_table(&connection, "cloud_backup_snapshots"), 1);
        assert_eq!(count_table(&connection, "cloud_backup_events"), 2);
    }

    #[test]
    fn stores_cloud_backup_policy_off_by_default() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");

        let default_policy =
            get_cloud_backup_policy_from_database(&mut connection, GOOGLE_DRIVE_PROVIDER)
                .expect("policy can be read");
        let enabled_policy = update_cloud_backup_policy_in_database(
            &mut connection,
            &UpdateCloudBackupPolicyInput {
                provider: GOOGLE_DRIVE_PROVIDER.to_string(),
                auto_backup_enabled: true,
            },
        )
        .expect("policy can be enabled");
        let disabled_policy = update_cloud_backup_policy_in_database(
            &mut connection,
            &UpdateCloudBackupPolicyInput {
                provider: GOOGLE_DRIVE_PROVIDER.to_string(),
                auto_backup_enabled: false,
            },
        )
        .expect("policy can be disabled");

        assert_eq!(default_policy.provider, GOOGLE_DRIVE_PROVIDER);
        assert!(!default_policy.auto_backup_enabled);
        assert_eq!(default_policy.trigger_name, MANUAL_IMPORT_SAVED_TRIGGER);
        assert_eq!(default_policy.min_interval_minutes, 0);
        assert!(enabled_policy.auto_backup_enabled);
        assert!(!disabled_policy.auto_backup_enabled);
        assert_eq!(count_table(&connection, "cloud_backup_policies"), 1);
    }

    #[test]
    fn reports_missing_local_backup_snapshots() {
        let backup_directory = unique_test_dir("empty-backup");
        let result = find_latest_backup_snapshot_path(&backup_directory);
        let snapshots =
            list_backup_snapshots_in_directory(&backup_directory).expect("missing backup list");

        assert!(result.is_err());
        assert!(snapshots.is_empty());
        assert!(result
            .expect_err("missing backup should fail")
            .contains("No local backup snapshots"));
    }

    #[test]
    fn rejects_restore_snapshot_file_names_outside_backup_directory() {
        let backup_directory = unique_test_dir("invalid-backup-file");
        let traversal_result =
            resolve_backup_snapshot_path(&backup_directory, "..\\warp-tracker-backup-1.json");
        let wrong_extension_result =
            resolve_backup_snapshot_path(&backup_directory, "warp-tracker-backup-1.txt");

        assert!(traversal_result.is_err());
        assert!(wrong_extension_result.is_err());
    }

    #[test]
    fn lists_saved_manual_warp_pulls_for_account_and_banner() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");
        upsert_warp_item_catalog(
            &mut connection,
            &[
                catalog_item("character-1001", "1001", "Pela", "character", 4),
                catalog_item("light-cone-2001", "2001", "Data Bank", "light_cone", 3),
            ],
        )
        .expect("catalog sync");
        save_manual_import_draft_to_database(&mut connection, &manual_import_draft())
            .expect("manual import");

        let pulls = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: Some("character_event".to_string()),
                limit: Some(10),
            },
        )
        .expect("saved pulls can be listed");

        assert_eq!(pulls.len(), 2);
        assert_eq!(pulls[0].banner_type, "character_event");
        assert_eq!(pulls[0].item_name, "Pela");
        assert_eq!(pulls[0].item_type, "character");
        assert_eq!(pulls[0].rarity, 4);
        assert_eq!(pulls[0].source, "manual");
        assert_eq!(pulls[0].pity_four_at_pull, Some(1));
        assert_eq!(pulls[0].pity_five_at_pull, None);
        assert_eq!(pulls[1].item_name, "Data Bank");
        assert_eq!(pulls[1].item_type, "light_cone");
        assert_eq!(pulls[1].rarity, 3);
        assert_eq!(pulls[1].pity_four_at_pull, None);
        assert_eq!(pulls[1].pity_five_at_pull, None);
    }

    #[test]
    fn recomputes_pity_after_manual_import() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");
        upsert_warp_item_catalog(
            &mut connection,
            &[
                catalog_item("light-cone-2001", "2001", "Data Bank", "light_cone", 3),
                catalog_item("character-1001", "1001", "Pela", "character", 4),
                catalog_item("character-1002", "1002", "Sparkle", "character", 5),
            ],
        )
        .expect("catalog sync");
        let draft = manual_import_draft_with_pulls(vec![
            manual_import_pull("character_event", "light-cone-2001", "Data Bank", 1),
            manual_import_pull("character_event", "character-1001", "Pela", 2),
            manual_import_pull("character_event", "character-1002", "Sparkle", 3),
        ]);

        save_manual_import_draft_to_database(&mut connection, &draft).expect("manual import");
        let pulls = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: Some("character_event".to_string()),
                limit: Some(10),
            },
        )
        .expect("saved pulls can be listed");

        assert_eq!(pulls[0].item_name, "Data Bank");
        assert_eq!(pulls[0].pity_four_at_pull, None);
        assert_eq!(pulls[0].pity_five_at_pull, None);
        assert_eq!(pulls[1].item_name, "Pela");
        assert_eq!(pulls[1].pity_four_at_pull, Some(2));
        assert_eq!(pulls[1].pity_five_at_pull, None);
        assert_eq!(pulls[2].item_name, "Sparkle");
        assert_eq!(pulls[2].pity_four_at_pull, Some(1));
        assert_eq!(pulls[2].pity_five_at_pull, Some(3));
    }

    #[test]
    fn rejects_invalid_warp_pull_list_query() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");

        let empty_account_result = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: " ".to_string(),
                banner_type: None,
                limit: Some(10),
            },
        );
        let zero_limit_result = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: None,
                limit: Some(0),
            },
        );
        let unsupported_banner_result = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: Some("unknown".to_string()),
                limit: Some(10),
            },
        );

        assert!(empty_account_result.is_err());
        assert!(zero_limit_result.is_err());
        assert!(unsupported_banner_result.is_err());
    }

    #[test]
    fn rejects_manual_import_draft_that_still_needs_review() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");

        let mut draft = manual_import_draft();
        draft.status = "needs_review".to_string();
        draft.issues_count = 1;

        let result = save_manual_import_draft_to_database(&mut connection, &draft);

        assert!(result.is_err());
        assert_eq!(count_table(&connection, "import_batches"), 0);
        assert_eq!(count_table(&connection, "warp_pulls"), 0);
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

    fn manual_import_draft() -> SaveManualImportDraftInput {
        manual_import_draft_with_pulls(vec![
            manual_import_pull("character_event", "character-1001", "Pela", 1),
            manual_import_pull("character_event", "light-cone-2001", "Data Bank", 2),
        ])
    }

    fn manual_import_draft_with_pulls(
        pulls: Vec<SaveManualImportDraftPullInput>,
    ) -> SaveManualImportDraftInput {
        let records_count = pulls.len();

        SaveManualImportDraftInput {
            account: ManualImportAccountInput {
                id: "account-1".to_string(),
                uid: "800000001".to_string(),
                region: Some("asia".to_string()),
                nickname: Some("Saki".to_string()),
            },
            status: "ready".to_string(),
            records_found: records_count,
            records_ready: records_count,
            records_skipped: 0,
            issues_count: 0,
            pulls,
        }
    }

    fn manual_import_pull(
        banner_type: &str,
        warp_item_id: &str,
        raw_item_name: &str,
        sequence_in_timestamp_group: i64,
    ) -> SaveManualImportDraftPullInput {
        SaveManualImportDraftPullInput {
            banner_type: banner_type.to_string(),
            warp_item_id: warp_item_id.to_string(),
            pulled_at: "2025-07-11T11:20:01".to_string(),
            pulled_at_timezone: Some("Asia/Jakarta".to_string()),
            source_line_number: sequence_in_timestamp_group + 2,
            sequence_in_timestamp_group,
            raw_item_name: raw_item_name.to_string(),
        }
    }

    fn cloud_backup_record(
        operation: &str,
        remote_md5_checksum: Option<&str>,
        size_bytes: Option<i64>,
    ) -> RecordCloudBackupSnapshotInput {
        RecordCloudBackupSnapshotInput {
            provider: "google_drive".to_string(),
            remote_file_id: "remote-1".to_string(),
            file_name: "warp-tracker-backup-20260606.json".to_string(),
            remote_md5_checksum: remote_md5_checksum.map(str::to_string),
            remote_modified_time: Some("2026-06-06T14:00:00.000Z".to_string()),
            size_bytes,
            operation: operation.to_string(),
            status: "success".to_string(),
            message: Some(format!("{operation} completed")),
        }
    }

    fn count_table(connection: &Connection, table_name: &str) -> i64 {
        connection
            .query_row(&format!("SELECT COUNT(*) FROM {table_name}"), [], |row| {
                row.get(0)
            })
            .expect("table count")
    }

    fn unique_test_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock after unix epoch")
            .as_nanos();

        std::env::temp_dir().join(format!("warp-tracker-{name}-{timestamp}"))
    }
}
