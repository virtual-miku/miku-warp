use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
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

    fn count_table(connection: &Connection, table_name: &str) -> i64 {
        connection
            .query_row(&format!("SELECT COUNT(*) FROM {table_name}"), [], |row| {
                row.get(0)
            })
            .expect("table count")
    }
}
