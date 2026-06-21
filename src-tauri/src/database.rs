use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const DATABASE_FILE_NAME: &str = "warp-tracker.sqlite";
const BACKUP_DIRECTORY_NAME: &str = "backups";
const BACKUP_TRASH_DIRECTORY_NAME: &str = "backup-trash";
const AUTO_BACKUP_FILE_NAME: &str = "miku-warp-autosave.json";
const BACKUP_SCHEMA_VERSION: i64 = 1;
const DEFAULT_TRASH_RETENTION_DAYS: i64 = 183;
const ALLOWED_TRASH_RETENTION_DAYS: [i64; 5] = [0, 30, 90, 183, 365];
const INIT_MIGRATION_VERSION: &str = "0001_init";
const INIT_MIGRATION_SQL: &str = include_str!("../migrations/0001_init.sql");
const ALLOW_DUPLICATE_WARP_ITEM_NAMES_VERSION: &str = "0002_allow_duplicate_warp_item_names";
const ALLOW_DUPLICATE_WARP_ITEM_NAMES_SQL: &str =
    include_str!("../migrations/0002_allow_duplicate_warp_item_names.sql");
const CLOUD_BACKUP_AUDIT_VERSION: &str = "0003_cloud_backup_audit";
const CLOUD_BACKUP_AUDIT_SQL: &str = include_str!("../migrations/0003_cloud_backup_audit.sql");
const AUTO_BACKUP_POLICY_VERSION: &str = "0004_auto_backup_policy";
const AUTO_BACKUP_POLICY_SQL: &str = include_str!("../migrations/0004_auto_backup_policy.sql");
const WARP_HISTORY_TRASH_VERSION: &str = "0005_warp_history_trash";
const WARP_HISTORY_TRASH_SQL: &str = include_str!("../migrations/0005_warp_history_trash.sql");
const AUTO_BACKUP_SYNC_VERSION: &str = "0006_auto_backup_sync";
const AUTO_BACKUP_SYNC_SQL: &str = include_str!("../migrations/0006_auto_backup_sync.sql");
const ACCOUNT_AVATAR_VERSION: &str = "0007_account_avatar";
const ACCOUNT_AVATAR_SQL: &str = include_str!("../migrations/0007_account_avatar.sql");
const ACCOUNT_AVATAR_COLUMN: &str = "avatar_path";
const ACCOUNT_TRASH_VERSION: &str = "0008_account_trash";
const ACCOUNT_TRASH_SQL: &str = include_str!("../migrations/0008_account_trash.sql");
const MANUAL_PITY_OVERRIDE_VERSION: &str = "0009_manual_pity_override";
const MANUAL_PITY_OVERRIDE_SQL: &str = include_str!("../migrations/0009_manual_pity_override.sql");
const TRASH_RETENTION_POLICY_VERSION: &str = "0010_trash_retention_policy";
const TRASH_RETENTION_POLICY_SQL: &str =
    include_str!("../migrations/0010_trash_retention_policy.sql");
const GOOGLE_DRIVE_PROVIDER: &str = "google_drive";
const DATA_CHANGED_TRIGGER: &str = "data_changed";

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
    #[serde(default)]
    pub pity_override: Option<i64>,
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
    pub records_restored: usize,
    pub records_skipped: usize,
    pub duplicate_records: usize,
    pub banner_count: usize,
}

#[derive(Debug)]
pub struct SaveGameHistoryImportInput {
    pub account: ManualImportAccountInput,
    pub merge_from_account_id: Option<String>,
    pub records_found: usize,
    pub source_cache_path: Option<String>,
    pub source_endpoint_host: Option<String>,
    pub pulls: Vec<SaveGameHistoryPullInput>,
}

#[derive(Debug)]
pub struct SaveGameHistoryPullInput {
    pub banner_type: String,
    pub item_source_id: Option<String>,
    pub gacha_id: String,
    pub pulled_at: String,
    pub pulled_at_timezone: Option<String>,
    pub sequence_in_timestamp_group: i64,
    pub raw_item_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveGameHistoryImportResult {
    pub import_batch_id: String,
    pub records_found: usize,
    pub records_inserted: usize,
    pub records_restored: usize,
    pub records_skipped: usize,
    pub duplicate_records: usize,
    pub banner_count: usize,
    pub manual_records_merged: usize,
    pub manual_records_matched: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWarpPullsInput {
    pub account_id: String,
    pub banner_type: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub search: Option<String>,
    pub rarity: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWarpPullsResult {
    pub pulls: Vec<WarpPullRow>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountRow {
    pub id: String,
    pub uid: String,
    pub region: Option<String>,
    pub nickname: Option<String>,
    pub avatar_path: Option<String>,
    pub total_pulls: i64,
    pub last_pull_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWarpBannerSummariesInput {
    pub account_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteWarpPullInput {
    pub account_id: String,
    pub pull_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteWarpPullsInput {
    pub account_id: String,
    pub pull_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAccountWarpHistoryInput {
    pub account_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAccountInput {
    pub account_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAccountAvatarInput {
    pub account_id: String,
    pub avatar_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAccountAvatarResult {
    pub account_id: String,
    pub avatar_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashWarpPullInput {
    pub account_id: String,
    pub pull_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashAccountInput {
    pub account_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupSnapshotInput {
    pub file_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreBackupSnapshotFromFileInput {
    pub file_path: String,
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
    pub is_auto_save: bool,
    pub size_bytes: u64,
    pub accounts: usize,
    pub banners: usize,
    pub warp_items: usize,
    pub import_batches: usize,
    pub warp_pulls: usize,
    pub uids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedBackupSnapshotSummary {
    pub backup_path: String,
    pub file_name: String,
    pub exported_at: String,
    pub deleted_at_unix_ms: u64,
    pub size_bytes: u64,
    pub accounts: usize,
    pub banners: usize,
    pub warp_items: usize,
    pub import_batches: usize,
    pub warp_pulls: usize,
    pub uids: Vec<String>,
}

#[derive(Debug)]
pub struct AutoBackupSnapshotFile {
    pub backup_path: String,
    pub file_name: String,
    pub bytes: Vec<u8>,
    pub content_hash: String,
    pub exported_at: String,
    pub changed: bool,
    pub warp_pulls: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupSyncStatus {
    pub content_hash: String,
    pub local_up_to_date: bool,
    pub cloud_required: bool,
    pub cloud_up_to_date: bool,
    pub has_pending_backup: bool,
    pub last_local_backup_at: Option<String>,
    pub last_cloud_backup_at: Option<String>,
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
pub struct TrashRetentionPolicy {
    pub retention_days: i64,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTrashRetentionPolicyInput {
    pub retention_days: i64,
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
pub struct DeleteWarpPullResult {
    pub account_id: String,
    pub pull_id: String,
    pub deleted_pulls: usize,
    pub recomputed_banner: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteWarpPullsResult {
    pub account_id: String,
    pub requested_pulls: usize,
    pub deleted_pulls: usize,
    pub recomputed_banners: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAccountWarpHistoryResult {
    pub account_id: String,
    pub deleted_pulls: usize,
    pub deleted_import_batches: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAccountResult {
    pub account_id: String,
    pub affected_accounts: usize,
    pub total_pulls: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashWarpPullMutationResult {
    pub account_id: String,
    pub pull_id: String,
    pub affected_pulls: usize,
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
    pub icon_path: Option<String>,
    pub pulled_at: String,
    pub source: String,
    pub pity_four_at_pull: Option<i64>,
    pub pity_five_at_pull: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedWarpPullRow {
    pub id: String,
    pub banner_type: String,
    pub item_name: String,
    pub item_type: String,
    pub rarity: i64,
    pub icon_path: Option<String>,
    pub pulled_at: String,
    pub source: String,
    pub deleted_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedAccountRow {
    pub id: String,
    pub uid: String,
    pub region: Option<String>,
    pub nickname: Option<String>,
    pub avatar_path: Option<String>,
    pub total_pulls: i64,
    pub last_pull_at: Option<String>,
    pub deleted_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListTrashedWarpPullsResult {
    pub pulls: Vec<TrashedWarpPullRow>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashAccountMutationResult {
    pub account_id: String,
    pub affected_accounts: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WarpBannerSummaryRow {
    pub banner_type: String,
    pub total_pulls: i64,
    pub current_four_star_pity: i64,
    pub current_five_star_pity: i64,
    pub four_star_count: i64,
    pub five_star_count: i64,
    pub four_star_pity_total: i64,
    pub five_star_pity_total: i64,
    pub rate_up_wins: i64,
    pub rate_up_losses: i64,
    pub rate_up_standard_losses: i64,
    pub rate_up_celestial_losses: i64,
    pub next_five_star_guaranteed: Option<bool>,
    pub last_four_star_pity: Option<i64>,
    pub last_five_star_pity: Option<i64>,
    pub last_four_star_name: Option<String>,
    pub last_five_star_name: Option<String>,
    pub last_pull_at: Option<String>,
    pub last_item_name: Option<String>,
    pub last_item_rarity: Option<i64>,
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
    manual_pity_override: Option<i64>,
    rarity: i64,
}

#[derive(Default)]
struct AccountHistoryMergeResult {
    moved_pull_count: usize,
    matched_game_history_count: usize,
    affected_banner_ids: HashSet<String>,
}

struct GameHistoryDuplicateCandidate {
    id: String,
    banner_id: String,
    warp_item_id: String,
    pulled_at: String,
    pulled_at_timezone: Option<String>,
    gacha_id: String,
    sequence_in_timestamp_group: i64,
    raw_item_name: Option<String>,
}

struct WarpBannerSummaryCandidate {
    banner_type: String,
    item_name: String,
    manual_pity_override: Option<i64>,
    rarity: i64,
    pulled_at: String,
}

struct BackupSyncState {
    local_content_hash: Option<String>,
    cloud_content_hash: Option<String>,
    local_backed_up_at: Option<String>,
    cloud_backed_up_at: Option<String>,
}

#[derive(Default)]
struct WarpBannerSummaryAccumulator {
    banner_type: String,
    total_pulls: i64,
    current_four_star_pity: i64,
    current_five_star_pity: i64,
    four_star_count: i64,
    five_star_count: i64,
    four_star_pity_total: i64,
    five_star_pity_total: i64,
    rate_up_wins: i64,
    rate_up_losses: i64,
    rate_up_standard_losses: i64,
    rate_up_celestial_losses: i64,
    next_five_star_guaranteed: Option<bool>,
    last_four_star_pity: Option<i64>,
    last_five_star_pity: Option<i64>,
    last_four_star_name: Option<String>,
    last_five_star_name: Option<String>,
    last_pull_at: Option<String>,
    last_item_name: Option<String>,
    last_item_rarity: Option<i64>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupContentHashPayload<'a> {
    schema_version: i64,
    applied_migrations: &'a [String],
    accounts: &'a [BackupAccountRow],
    banners: &'a [BackupBannerRow],
    warp_items: &'a [BackupWarpItemRow],
    import_batches: &'a [BackupImportBatchRow],
    warp_pulls: &'a [BackupWarpPullRow],
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupAccountRow {
    id: String,
    uid: String,
    region: Option<String>,
    nickname: Option<String>,
    #[serde(default)]
    avatar_path: Option<String>,
    created_at: String,
    updated_at: String,
    #[serde(default)]
    deleted_at: Option<String>,
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
    #[serde(default)]
    manual_pity_override: Option<i64>,
    created_at: String,
    #[serde(default)]
    deleted_at: Option<String>,
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
    Migration {
        version: WARP_HISTORY_TRASH_VERSION,
        sql: WARP_HISTORY_TRASH_SQL,
    },
    Migration {
        version: AUTO_BACKUP_SYNC_VERSION,
        sql: AUTO_BACKUP_SYNC_SQL,
    },
    Migration {
        version: ACCOUNT_AVATAR_VERSION,
        sql: ACCOUNT_AVATAR_SQL,
    },
    Migration {
        version: ACCOUNT_TRASH_VERSION,
        sql: ACCOUNT_TRASH_SQL,
    },
    Migration {
        version: MANUAL_PITY_OVERRIDE_VERSION,
        sql: MANUAL_PITY_OVERRIDE_SQL,
    },
    Migration {
        version: TRASH_RETENTION_POLICY_VERSION,
        sql: TRASH_RETENTION_POLICY_SQL,
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

pub fn save_game_history_import(
    app: &AppHandle,
    input: SaveGameHistoryImportInput,
) -> Result<SaveGameHistoryImportResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    save_game_history_import_to_database(&mut connection, &input)
}

pub fn list_warp_pulls(
    app: &AppHandle,
    query: ListWarpPullsInput,
) -> Result<ListWarpPullsResult, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;

    list_warp_pulls_from_database(&connection, &query)
}

pub fn list_accounts(app: &AppHandle) -> Result<Vec<AccountRow>, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;

    list_accounts_from_database(&connection)
}

pub fn update_account_avatar(
    app: &AppHandle,
    input: UpdateAccountAvatarInput,
) -> Result<UpdateAccountAvatarResult, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;

    update_account_avatar_in_database(&connection, &input)
}

pub fn list_warp_banner_summaries(
    app: &AppHandle,
    query: ListWarpBannerSummariesInput,
) -> Result<Vec<WarpBannerSummaryRow>, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;

    list_warp_banner_summaries_from_database(&connection, &query)
}

pub fn delete_warp_pull(
    app: &AppHandle,
    input: DeleteWarpPullInput,
) -> Result<DeleteWarpPullResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    delete_warp_pull_from_database(&mut connection, &input)
}

pub fn delete_warp_pulls(
    app: &AppHandle,
    input: DeleteWarpPullsInput,
) -> Result<DeleteWarpPullsResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    delete_warp_pulls_from_database(&mut connection, &input)
}

pub fn delete_account_warp_history(
    app: &AppHandle,
    input: DeleteAccountWarpHistoryInput,
) -> Result<DeleteAccountWarpHistoryResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    delete_account_warp_history_from_database(&mut connection, &input)
}

pub fn delete_account(
    app: &AppHandle,
    input: DeleteAccountInput,
) -> Result<DeleteAccountResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    delete_account_from_database(&mut connection, &input)
}

pub fn list_trashed_warp_pulls(
    app: &AppHandle,
    query: ListWarpPullsInput,
) -> Result<ListTrashedWarpPullsResult, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;

    list_trashed_warp_pulls_from_database(&connection, &query)
}

pub fn list_trashed_accounts(app: &AppHandle) -> Result<Vec<TrashedAccountRow>, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;

    list_trashed_accounts_from_database(&connection)
}

pub fn restore_trashed_warp_pull(
    app: &AppHandle,
    input: TrashWarpPullInput,
) -> Result<TrashWarpPullMutationResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    restore_trashed_warp_pull_in_database(&mut connection, &input)
}

pub fn restore_trashed_account(
    app: &AppHandle,
    input: TrashAccountInput,
) -> Result<TrashAccountMutationResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    restore_trashed_account_in_database(&mut connection, &input)
}

pub fn permanently_delete_trashed_warp_pull(
    app: &AppHandle,
    input: TrashWarpPullInput,
) -> Result<TrashWarpPullMutationResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    permanently_delete_trashed_warp_pull_from_database(&mut connection, &input)
}

pub fn permanently_delete_trashed_account(
    app: &AppHandle,
    input: TrashAccountInput,
) -> Result<TrashAccountMutationResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    permanently_delete_trashed_account_from_database(&mut connection, &input)
}

pub fn export_backup_snapshot(app: &AppHandle) -> Result<ExportBackupSnapshotResult, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;
    let backup_directory = resolve_backup_directory(app)?;

    export_backup_snapshot_to_directory(&connection, &backup_directory)
}

pub fn save_auto_backup_snapshot(app: &AppHandle) -> Result<AutoBackupSnapshotFile, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;
    let backup_directory = resolve_backup_directory(app)?;

    save_auto_backup_snapshot_to_directory(&connection, &backup_directory)
}

pub fn get_auto_backup_sync_status(app: &AppHandle) -> Result<AutoBackupSyncStatus, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;
    let backup_directory = resolve_backup_directory(app)?;
    let snapshot = build_backup_snapshot(&connection)?;
    let content_hash = calculate_backup_content_hash(&snapshot)?;
    let state = read_backup_sync_state(&connection)?;
    let policy = get_cloud_backup_policy_from_database(&mut connection, GOOGLE_DRIVE_PROVIDER)?;
    let local_backup_exists = backup_directory.join(AUTO_BACKUP_FILE_NAME).exists();
    let local_up_to_date =
        local_backup_exists && state.local_content_hash.as_deref() == Some(content_hash.as_str());
    let cloud_required = policy.auto_backup_enabled;
    let cloud_up_to_date = state.cloud_content_hash.as_deref() == Some(content_hash.as_str());

    Ok(AutoBackupSyncStatus {
        content_hash,
        local_up_to_date,
        cloud_required,
        cloud_up_to_date,
        has_pending_backup: !local_up_to_date || (cloud_required && !cloud_up_to_date),
        last_local_backup_at: state.local_backed_up_at,
        last_cloud_backup_at: state.cloud_backed_up_at,
    })
}

pub fn mark_cloud_auto_backup_synced(
    app: &AppHandle,
    content_hash: &str,
    backed_up_at: Option<&str>,
) -> Result<AutoBackupSyncStatus, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;

    mark_cloud_backup_synced(&connection, content_hash, backed_up_at)?;
    get_auto_backup_sync_status(app)
}

pub fn list_backup_snapshots(app: &AppHandle) -> Result<Vec<BackupSnapshotSummary>, String> {
    let backup_directory = resolve_backup_directory(app)?;

    list_backup_snapshots_in_directory(&backup_directory)
}

pub fn delete_backup_snapshot(
    app: &AppHandle,
    input: DeleteBackupSnapshotInput,
) -> Result<DeleteBackupSnapshotResult, String> {
    let backup_directory = resolve_backup_directory(app)?;
    let backup_trash_directory = resolve_backup_trash_directory(app)?;
    let backup_path = resolve_backup_snapshot_path(&backup_directory, &input.file_name)?;

    move_backup_snapshot_file_to_trash(&backup_directory, &backup_trash_directory, &backup_path)
}

pub fn list_trashed_backup_snapshots(
    app: &AppHandle,
) -> Result<Vec<TrashedBackupSnapshotSummary>, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;
    let retention_days = read_trash_retention_policy(&connection)?.retention_days;
    let backup_trash_directory = resolve_backup_trash_directory(app)?;

    list_trashed_backup_snapshots_in_directory(&backup_trash_directory, retention_days)
}

pub fn restore_trashed_backup_snapshot(
    app: &AppHandle,
    input: DeleteBackupSnapshotInput,
) -> Result<DeleteBackupSnapshotResult, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;
    let retention_days = read_trash_retention_policy(&connection)?.retention_days;
    let backup_directory = resolve_backup_directory(app)?;
    let backup_trash_directory = resolve_backup_trash_directory(app)?;
    let backup_path = resolve_backup_snapshot_path(&backup_trash_directory, &input.file_name)?;

    restore_trashed_backup_snapshot_file(
        &backup_directory,
        &backup_trash_directory,
        &backup_path,
        retention_days,
    )
}

pub fn permanently_delete_trashed_backup_snapshot(
    app: &AppHandle,
    input: DeleteBackupSnapshotInput,
) -> Result<DeleteBackupSnapshotResult, String> {
    let backup_trash_directory = resolve_backup_trash_directory(app)?;
    let backup_path = resolve_backup_snapshot_path(&backup_trash_directory, &input.file_name)?;

    delete_backup_snapshot_file(&backup_trash_directory, &backup_path)
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

pub fn replace_database_from_backup_file(
    app: &AppHandle,
    input: RestoreBackupSnapshotFromFileInput,
) -> Result<RestoreBackupSnapshotResult, String> {
    let database_path = resolve_database_path(app)?;
    let mut connection = open_database(&database_path)?;
    let backup_path = PathBuf::from(input.file_path);

    replace_database_from_backup_snapshot_file(&mut connection, &backup_path)
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

pub fn get_trash_retention_policy(app: &AppHandle) -> Result<TrashRetentionPolicy, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;

    read_trash_retention_policy(&connection)
}

pub fn update_trash_retention_policy(
    app: &AppHandle,
    input: UpdateTrashRetentionPolicyInput,
) -> Result<TrashRetentionPolicy, String> {
    let database_path = resolve_database_path(app)?;
    let connection = open_database(&database_path)?;

    update_trash_retention_policy_in_database(&connection, input.retention_days)
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

fn resolve_backup_trash_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(BACKUP_TRASH_DIRECTORY_NAME))
        .map_err(|error| format!("Failed to resolve backup Trash directory: {error}"))
}

fn open_database(database_path: &PathBuf) -> Result<Connection, String> {
    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create database directory: {error}"))?;
    }

    let connection = Connection::open(database_path)
        .map_err(|error| format!("Failed to open database: {error}"))?;

    apply_migrations(&connection)?;
    let retention_days = read_trash_retention_policy(&connection)?.retention_days;
    purge_expired_trashed_warp_pulls(&connection, retention_days)?;
    purge_expired_trashed_accounts(&connection, retention_days)?;

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
    reconcile_account_avatar_migration(connection, &mut applied_migrations)?;

    for migration in MIGRATIONS {
        if applied_migrations
            .iter()
            .any(|version| version == migration.version)
        {
            continue;
        }

        let transaction = connection.unchecked_transaction().map_err(|error| {
            format!(
                "Failed to start migration {} transaction: {error}",
                migration.version
            )
        })?;

        transaction
            .execute_batch(migration.sql)
            .map_err(|error| format!("Failed to apply migration {}: {error}", migration.version))?;
        record_applied_migration(&transaction, migration.version)?;
        transaction.commit().map_err(|error| {
            format!(
                "Failed to commit migration {} transaction: {error}",
                migration.version
            )
        })?;
        applied_migrations.push(migration.version.to_string());
    }

    Ok(())
}

fn reconcile_account_avatar_migration(
    connection: &Connection,
    applied_migrations: &mut Vec<String>,
) -> Result<(), String> {
    let metadata_is_missing = !applied_migrations
        .iter()
        .any(|version| version == ACCOUNT_AVATAR_VERSION);

    if metadata_is_missing && accounts_has_avatar_column(connection)? {
        record_applied_migration(connection, ACCOUNT_AVATAR_VERSION)?;
        applied_migrations.push(ACCOUNT_AVATAR_VERSION.to_string());
    }

    Ok(())
}

fn accounts_has_avatar_column(connection: &Connection) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS (
               SELECT 1
               FROM pragma_table_info('accounts')
               WHERE name = ?1
             )",
            [ACCOUNT_AVATAR_COLUMN],
            |row| row.get(0),
        )
        .map_err(|error| format!("Failed to inspect accounts schema: {error}"))
}

fn record_applied_migration(connection: &Connection, version: &str) -> Result<(), String> {
    connection
        .execute(
            "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?1)",
            [version],
        )
        .map_err(|error| format!("Failed to record migration {version}: {error}"))?;

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

    let import_batch_id = create_import_batch_id("manual-import")?;
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
        "manual",
        batch_banner_type,
        draft.records_found,
    )?;

    let mut records_inserted = 0;
    let mut records_restored = 0;
    let mut duplicate_records = 0;

    {
        let mut insert_pull_statement = transaction
            .prepare(
                "INSERT OR IGNORE INTO warp_pulls (
                   id, account_id, banner_id, warp_item_id, pulled_at, pulled_at_timezone,
                   source, source_import_id, source_line_number, sequence_in_timestamp_group,
                   raw_item_name, manual_pity_override
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'manual', ?7, ?8, ?9, ?10, ?11)",
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
                    pull.pity_override,
                ])
                .map_err(|error| {
                    format!(
                        "Failed to insert manual pull {} at {}: {error}",
                        pull.raw_item_name, pull.pulled_at
                    )
                })?;

            if affected_rows == 1 {
                records_inserted += 1;
            } else if restore_trashed_manual_import_pull(
                &transaction,
                ManualImportRestoreInput {
                    pull_id: &pull_id,
                    account_id: &draft.account.id,
                    banner_id: &banner_id,
                    warp_item_id: &pull.warp_item_id,
                    pulled_at: &pull.pulled_at,
                    pulled_at_timezone: pull.pulled_at_timezone.as_deref(),
                    import_batch_id: &import_batch_id,
                    source_line_number: pull.source_line_number,
                    sequence_in_timestamp_group: pull.sequence_in_timestamp_group,
                    raw_item_name: &pull.raw_item_name,
                    pity_override: pull.pity_override,
                },
            )? {
                records_restored += 1;
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
        records_inserted + records_restored,
        records_skipped,
    )?;

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit manual import transaction: {error}"))?;

    Ok(SaveManualImportDraftResult {
        import_batch_id,
        records_found: draft.records_found,
        records_inserted,
        records_restored,
        records_skipped,
        duplicate_records,
        banner_count: banner_types.len(),
    })
}

fn save_game_history_import_to_database(
    connection: &mut Connection,
    input: &SaveGameHistoryImportInput,
) -> Result<SaveGameHistoryImportResult, String> {
    validate_game_history_import(input)?;

    let import_batch_id = create_import_batch_id("game-history-import")?;
    let banner_types = input
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
        .map_err(|error| format!("Failed to start game history import transaction: {error}"))?;

    upsert_account(&transaction, &input.account)?;
    let account_merge_result = merge_source_account_history(
        &transaction,
        input.merge_from_account_id.as_deref(),
        &input.account.id,
    )?;
    let mut affected_banner_ids = account_merge_result.affected_banner_ids.clone();

    for banner_type in &banner_types {
        affected_banner_ids.insert(ensure_banner(&transaction, banner_type)?);
    }

    insert_import_batch(
        &transaction,
        &import_batch_id,
        &input.account.id,
        "game_history",
        batch_banner_type,
        input.records_found,
    )?;

    let mut records_inserted = 0;
    let mut records_restored = 0;
    let mut duplicate_records = 0;
    let mut manual_records_matched = account_merge_result.matched_game_history_count;

    {
        let mut insert_pull_statement = transaction
            .prepare(
                "INSERT OR IGNORE INTO warp_pulls (
                   id, account_id, banner_id, warp_item_id, pulled_at, pulled_at_timezone,
                   gacha_id, source, source_import_id, source_line_number,
                   sequence_in_timestamp_group, raw_item_name
                 )
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'game_history', ?8, ?9, ?10, ?11)",
            )
            .map_err(|error| {
                format!("Failed to prepare game history pull insert statement: {error}")
            })?;

        for (index, pull) in input.pulls.iter().enumerate() {
            let banner_id = banner_id_for_type(&pull.banner_type);
            let warp_item_id = warp_item_id_for_game_history_pull(&transaction, pull)?;
            let game_pull = GameHistoryDuplicateCandidate {
                id: String::new(),
                banner_id: banner_id.to_string(),
                warp_item_id: warp_item_id.clone(),
                pulled_at: pull.pulled_at.clone(),
                pulled_at_timezone: pull.pulled_at_timezone.clone(),
                gacha_id: pull.gacha_id.clone(),
                sequence_in_timestamp_group: pull.sequence_in_timestamp_group,
                raw_item_name: Some(pull.raw_item_name.clone()),
            };
            let source_line_number = i64::try_from(index + 1)
                .map_err(|error| format!("Game history import is too large: {error}"))?;

            if restore_trashed_game_history_pull_by_gacha(
                &transaction,
                &input.account.id,
                &banner_id,
                &pull.gacha_id,
                &game_pull,
                &import_batch_id,
                source_line_number,
            )? {
                records_restored += 1;
                affected_banner_ids.insert(banner_id.to_string());
                continue;
            }

            if active_game_history_gacha_exists(
                &transaction,
                &input.account.id,
                &banner_id,
                &pull.gacha_id,
            )? {
                duplicate_records += 1;
                continue;
            }

            if let Some(manual_pull_id) = find_nearest_manual_pull_for_game_history(
                &transaction,
                &input.account.id,
                &banner_id,
                &pull.pulled_at,
                pull.sequence_in_timestamp_group,
            )? {
                enrich_manual_pull_with_game_history(&transaction, &manual_pull_id, &game_pull)?;
                duplicate_records += 1;
                manual_records_matched += 1;
                affected_banner_ids.insert(banner_id.to_string());
                continue;
            }

            if let Some(manual_pull_id) = find_nearest_trashed_manual_pull_for_game_history(
                &transaction,
                &input.account.id,
                &banner_id,
                &pull.pulled_at,
                pull.sequence_in_timestamp_group,
            )? {
                restore_trashed_manual_pull_with_game_history(
                    &transaction,
                    &manual_pull_id,
                    &game_pull,
                    &import_batch_id,
                    source_line_number,
                )?;
                records_restored += 1;
                manual_records_matched += 1;
                affected_banner_ids.insert(banner_id.to_string());
                continue;
            }

            let pull_id = game_history_pull_id(&input.account.id, &banner_id, &pull.gacha_id);
            let affected_rows = insert_pull_statement
                .execute(params![
                    pull_id,
                    &input.account.id,
                    banner_id,
                    warp_item_id,
                    &pull.pulled_at,
                    pull.pulled_at_timezone.as_deref(),
                    &pull.gacha_id,
                    &import_batch_id,
                    source_line_number,
                    pull.sequence_in_timestamp_group,
                    &pull.raw_item_name,
                ])
                .map_err(|error| {
                    format!(
                        "Failed to insert game history pull {} ({}) at {}: {error}",
                        pull.raw_item_name, pull.gacha_id, pull.pulled_at
                    )
                })?;

            if affected_rows == 1 {
                records_inserted += 1;
                affected_banner_ids.insert(banner_id.to_string());
            } else {
                duplicate_records += 1;
            }
        }
    }

    let records_skipped = input.records_found.saturating_sub(input.pulls.len()) + duplicate_records;
    for banner_id in &affected_banner_ids {
        recompute_pity_for_account_banner(&transaction, &input.account.id, &banner_id)?;
    }

    update_import_batch_result(
        &transaction,
        &import_batch_id,
        records_inserted + records_restored,
        records_skipped,
    )?;

    record_game_history_import_notes(&transaction, &import_batch_id, input)?;

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit game history import transaction: {error}"))?;

    Ok(SaveGameHistoryImportResult {
        import_batch_id,
        records_found: input.records_found,
        records_inserted,
        records_restored,
        records_skipped,
        duplicate_records,
        banner_count: banner_types.len(),
        manual_records_merged: account_merge_result.moved_pull_count,
        manual_records_matched,
    })
}

fn list_warp_pulls_from_database(
    connection: &Connection,
    query: &ListWarpPullsInput,
) -> Result<ListWarpPullsResult, String> {
    validate_list_warp_pulls_query(query)?;
    let search = normalized_search_filter(query.search.as_deref());
    let search_param = search.as_deref();
    let limit = query_limit(query) as i64;
    let offset = query_offset(query) as i64;
    let total = connection
        .query_row(
            "SELECT COUNT(*)
             FROM warp_pulls wp
             INNER JOIN accounts a ON a.id = wp.account_id
             INNER JOIN banners b ON b.id = wp.banner_id
             INNER JOIN warp_items wi ON wi.id = wp.warp_item_id
             WHERE wp.account_id = ?1
               AND a.deleted_at IS NULL
               AND wp.deleted_at IS NULL
               AND (?2 IS NULL OR b.banner_type = ?2)
               AND (?3 IS NULL OR lower(wi.name) LIKE '%' || lower(?3) || '%')
               AND (?4 IS NULL OR wi.rarity = ?4)",
            params![
                &query.account_id,
                query.banner_type.as_deref(),
                search_param,
                query.rarity,
            ],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("Failed to count warp pulls: {error}"))?;

    let mut statement = connection
        .prepare(
            "SELECT wp.id, b.banner_type, wi.name, wi.item_type, wi.rarity,
                    wi.icon_path, wp.pulled_at, wp.source, wp.pity_4, wp.pity_5,
                    wp.sequence_in_timestamp_group
             FROM warp_pulls wp
             INNER JOIN accounts a ON a.id = wp.account_id
             INNER JOIN banners b ON b.id = wp.banner_id
             INNER JOIN warp_items wi ON wi.id = wp.warp_item_id
             WHERE wp.account_id = ?1
               AND a.deleted_at IS NULL
               AND wp.deleted_at IS NULL
               AND (?2 IS NULL OR b.banner_type = ?2)
               AND (?3 IS NULL OR lower(wi.name) LIKE '%' || lower(?3) || '%')
               AND (?4 IS NULL OR wi.rarity = ?4)
             ORDER BY wp.pulled_at DESC, wp.sequence_in_timestamp_group DESC, wp.id DESC
             LIMIT ?5 OFFSET ?6",
        )
        .map_err(|error| format!("Failed to prepare warp pull query: {error}"))?;

    let rows = statement
        .query_map(
            params![
                &query.account_id,
                query.banner_type.as_deref(),
                search_param,
                query.rarity,
                limit,
                offset,
            ],
            map_warp_pull_row,
        )
        .map_err(|error| format!("Failed to query warp pulls: {error}"))?;

    let pulls = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode warp pull rows: {error}"))?;

    Ok(ListWarpPullsResult {
        pulls,
        total: usize::try_from(total).unwrap_or(0),
    })
}

fn list_accounts_from_database(connection: &Connection) -> Result<Vec<AccountRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT a.id, a.uid, a.region, a.nickname, a.avatar_path,
                    COUNT(wp.id) AS total_pulls,
                    MAX(wp.pulled_at) AS last_pull_at
             FROM accounts a
             LEFT JOIN warp_pulls wp ON wp.account_id = a.id AND wp.deleted_at IS NULL
             WHERE a.deleted_at IS NULL
             GROUP BY a.id, a.uid, a.region, a.nickname, a.avatar_path
             ORDER BY MAX(wp.pulled_at) DESC, a.uid ASC, COALESCE(a.region, '') ASC, a.id ASC",
        )
        .map_err(|error| format!("Failed to prepare account list query: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(AccountRow {
                id: row.get(0)?,
                uid: row.get(1)?,
                region: row.get(2)?,
                nickname: row.get(3)?,
                avatar_path: row.get(4)?,
                total_pulls: row.get(5)?,
                last_pull_at: row.get(6)?,
            })
        })
        .map_err(|error| format!("Failed to query accounts: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode accounts: {error}"))
}

fn update_account_avatar_in_database(
    connection: &Connection,
    input: &UpdateAccountAvatarInput,
) -> Result<UpdateAccountAvatarResult, String> {
    validate_account_id(&input.account_id, "Avatar account id")?;
    let avatar_path = normalize_account_avatar_path(input.avatar_path.as_deref());
    validate_account_avatar_path(avatar_path)?;

    let updated_rows = connection
        .execute(
            "UPDATE accounts
             SET avatar_path = ?1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?2 AND deleted_at IS NULL",
            params![avatar_path, &input.account_id],
        )
        .map_err(|error| format!("Failed to update account avatar: {error}"))?;

    if updated_rows == 0 {
        return Err(format!("Account {} was not found.", input.account_id));
    }

    Ok(UpdateAccountAvatarResult {
        account_id: input.account_id.clone(),
        avatar_path: avatar_path.map(str::to_owned),
    })
}

fn list_warp_banner_summaries_from_database(
    connection: &Connection,
    query: &ListWarpBannerSummariesInput,
) -> Result<Vec<WarpBannerSummaryRow>, String> {
    validate_list_warp_banner_summaries_query(query)?;

    let mut statement = connection
        .prepare(
            "SELECT b.banner_type, wi.name, wi.rarity, wp.pulled_at,
                    wp.manual_pity_override
             FROM warp_pulls wp
             INNER JOIN accounts a ON a.id = wp.account_id
             INNER JOIN banners b ON b.id = wp.banner_id
             INNER JOIN warp_items wi ON wi.id = wp.warp_item_id
             WHERE wp.account_id = ?1
               AND a.deleted_at IS NULL
               AND wp.deleted_at IS NULL
             ORDER BY b.banner_type ASC, wp.pulled_at ASC,
                      wp.sequence_in_timestamp_group ASC, wp.id ASC",
        )
        .map_err(|error| format!("Failed to prepare banner summary query: {error}"))?;
    let rows = statement
        .query_map(params![&query.account_id], |row| {
            Ok(WarpBannerSummaryCandidate {
                banner_type: row.get(0)?,
                item_name: row.get(1)?,
                rarity: row.get(2)?,
                pulled_at: row.get(3)?,
                manual_pity_override: row.get(4)?,
            })
        })
        .map_err(|error| format!("Failed to query banner summary rows: {error}"))?;
    let pulls = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode banner summary rows: {error}"))?;

    Ok(build_warp_banner_summaries(pulls))
}

fn delete_warp_pull_from_database(
    connection: &mut Connection,
    input: &DeleteWarpPullInput,
) -> Result<DeleteWarpPullResult, String> {
    validate_delete_warp_pull(input)?;

    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to start warp pull delete transaction: {error}"))?;
    let banner_id = transaction
        .query_row(
            "SELECT banner_id FROM warp_pulls
             WHERE id = ?1 AND account_id = ?2 AND deleted_at IS NULL",
            params![&input.pull_id, &input.account_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Failed to read warp pull {}: {error}", input.pull_id))?;
    let mut deleted_pulls = 0;
    let mut recomputed_banner = false;

    if let Some(banner_id) = banner_id {
        deleted_pulls = transaction
            .execute(
                "UPDATE warp_pulls
                 SET deleted_at = CURRENT_TIMESTAMP
                 WHERE id = ?1 AND account_id = ?2 AND deleted_at IS NULL",
                params![&input.pull_id, &input.account_id],
            )
            .map_err(|error| format!("Failed to delete warp pull {}: {error}", input.pull_id))?;
        recompute_pity_for_account_banner(&transaction, &input.account_id, &banner_id)?;
        recomputed_banner = true;
    }

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit warp pull delete transaction: {error}"))?;

    Ok(DeleteWarpPullResult {
        account_id: input.account_id.clone(),
        pull_id: input.pull_id.clone(),
        deleted_pulls,
        recomputed_banner,
    })
}

fn delete_warp_pulls_from_database(
    connection: &mut Connection,
    input: &DeleteWarpPullsInput,
) -> Result<DeleteWarpPullsResult, String> {
    validate_delete_warp_pulls(input)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to start selected history delete transaction: {error}"))?;
    let mut banner_ids = HashSet::new();
    let mut deleted_pulls = 0;

    {
        let mut banner_statement = transaction
            .prepare(
                "SELECT banner_id FROM warp_pulls
                 WHERE id = ?1 AND account_id = ?2 AND deleted_at IS NULL",
            )
            .map_err(|error| format!("Failed to prepare selected pull lookup: {error}"))?;
        let mut delete_statement = transaction
            .prepare(
                "UPDATE warp_pulls SET deleted_at = CURRENT_TIMESTAMP
                 WHERE id = ?1 AND account_id = ?2 AND deleted_at IS NULL",
            )
            .map_err(|error| format!("Failed to prepare selected pull delete: {error}"))?;

        for pull_id in input.pull_ids.iter().collect::<HashSet<_>>() {
            let banner_id = banner_statement
                .query_row(params![pull_id, &input.account_id], |row| {
                    row.get::<_, String>(0)
                })
                .optional()
                .map_err(|error| format!("Failed to read selected pull {pull_id}: {error}"))?;

            if let Some(banner_id) = banner_id {
                deleted_pulls += delete_statement
                    .execute(params![pull_id, &input.account_id])
                    .map_err(|error| {
                        format!("Failed to move selected pull {pull_id} to Trash: {error}")
                    })?;
                banner_ids.insert(banner_id);
            }
        }
    }

    for banner_id in &banner_ids {
        recompute_pity_for_account_banner(&transaction, &input.account_id, banner_id)?;
    }

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit selected history delete: {error}"))?;

    Ok(DeleteWarpPullsResult {
        account_id: input.account_id.clone(),
        requested_pulls: input.pull_ids.len(),
        deleted_pulls,
        recomputed_banners: banner_ids.len(),
    })
}

fn delete_account_warp_history_from_database(
    connection: &mut Connection,
    input: &DeleteAccountWarpHistoryInput,
) -> Result<DeleteAccountWarpHistoryResult, String> {
    validate_account_id(&input.account_id, "History account id")?;

    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to start account history delete transaction: {error}"))?;
    let deleted_pulls = transaction
        .execute(
            "UPDATE warp_pulls
             SET deleted_at = CURRENT_TIMESTAMP
             WHERE account_id = ?1 AND deleted_at IS NULL",
            params![&input.account_id],
        )
        .map_err(|error| format!("Failed to delete account warp pulls: {error}"))?;
    let deleted_import_batches = 0;

    for banner_id in banner_ids_for_account(&transaction, &input.account_id)? {
        recompute_pity_for_account_banner(&transaction, &input.account_id, &banner_id)?;
    }

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit account history delete transaction: {error}"))?;

    Ok(DeleteAccountWarpHistoryResult {
        account_id: input.account_id.clone(),
        deleted_pulls,
        deleted_import_batches,
    })
}

fn delete_account_from_database(
    connection: &mut Connection,
    input: &DeleteAccountInput,
) -> Result<DeleteAccountResult, String> {
    validate_account_id(&input.account_id, "Delete account id")?;

    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to start account delete transaction: {error}"))?;
    let total_pulls = transaction
        .query_row(
            "SELECT COUNT(wp.id)
             FROM accounts a
             LEFT JOIN warp_pulls wp ON wp.account_id = a.id AND wp.deleted_at IS NULL
             WHERE a.id = ?1 AND a.deleted_at IS NULL",
            params![&input.account_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("Failed to count account pulls: {error}"))?;
    let affected_accounts = transaction
        .execute(
            "UPDATE accounts
             SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND deleted_at IS NULL",
            params![&input.account_id],
        )
        .map_err(|error| format!("Failed to move account to Trash: {error}"))?;

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit account delete transaction: {error}"))?;

    Ok(DeleteAccountResult {
        account_id: input.account_id.clone(),
        affected_accounts,
        total_pulls: usize::try_from(total_pulls).unwrap_or(0),
    })
}

fn list_trashed_warp_pulls_from_database(
    connection: &Connection,
    query: &ListWarpPullsInput,
) -> Result<ListTrashedWarpPullsResult, String> {
    validate_list_warp_pulls_query(query)?;
    let search = normalized_search_filter(query.search.as_deref());
    let search_param = search.as_deref();
    let limit = query_limit(query) as i64;
    let offset = query_offset(query) as i64;
    let total = connection
        .query_row(
            "SELECT COUNT(*)
             FROM warp_pulls wp
             INNER JOIN banners b ON b.id = wp.banner_id
             INNER JOIN warp_items wi ON wi.id = wp.warp_item_id
             WHERE wp.account_id = ?1
               AND wp.deleted_at IS NOT NULL
               AND (?2 IS NULL OR b.banner_type = ?2)
               AND (?3 IS NULL OR lower(wi.name) LIKE '%' || lower(?3) || '%')
               AND (?4 IS NULL OR wi.rarity = ?4)",
            params![
                &query.account_id,
                query.banner_type.as_deref(),
                search_param,
                query.rarity,
            ],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("Failed to count trashed warp pulls: {error}"))?;
    let mut statement = connection
        .prepare(
            "SELECT wp.id, b.banner_type, wi.name, wi.item_type, wi.rarity,
                    wi.icon_path, wp.pulled_at, wp.source, wp.deleted_at
             FROM warp_pulls wp
             INNER JOIN banners b ON b.id = wp.banner_id
             INNER JOIN warp_items wi ON wi.id = wp.warp_item_id
             WHERE wp.account_id = ?1
               AND wp.deleted_at IS NOT NULL
               AND (?2 IS NULL OR b.banner_type = ?2)
               AND (?3 IS NULL OR lower(wi.name) LIKE '%' || lower(?3) || '%')
               AND (?4 IS NULL OR wi.rarity = ?4)
             ORDER BY wp.deleted_at DESC, wp.id DESC
             LIMIT ?5 OFFSET ?6",
        )
        .map_err(|error| format!("Failed to prepare trashed warp pull query: {error}"))?;
    let rows = statement
        .query_map(
            params![
                &query.account_id,
                query.banner_type.as_deref(),
                search_param,
                query.rarity,
                limit,
                offset,
            ],
            |row| {
                Ok(TrashedWarpPullRow {
                    id: row.get(0)?,
                    banner_type: row.get(1)?,
                    item_name: row.get(2)?,
                    item_type: row.get(3)?,
                    rarity: row.get(4)?,
                    icon_path: row.get(5)?,
                    pulled_at: row.get(6)?,
                    source: row.get(7)?,
                    deleted_at: row.get(8)?,
                })
            },
        )
        .map_err(|error| format!("Failed to query trashed warp pulls: {error}"))?;
    let pulls = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode trashed warp pulls: {error}"))?;

    Ok(ListTrashedWarpPullsResult {
        pulls,
        total: usize::try_from(total).unwrap_or(0),
    })
}

fn list_trashed_accounts_from_database(
    connection: &Connection,
) -> Result<Vec<TrashedAccountRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT a.id, a.uid, a.region, a.nickname, a.avatar_path,
                    COUNT(wp.id) AS total_pulls,
                    MAX(wp.pulled_at) AS last_pull_at,
                    a.deleted_at
             FROM accounts a
             LEFT JOIN warp_pulls wp ON wp.account_id = a.id AND wp.deleted_at IS NULL
             WHERE a.deleted_at IS NOT NULL
             GROUP BY a.id, a.uid, a.region, a.nickname, a.avatar_path, a.deleted_at
             ORDER BY a.deleted_at DESC, a.uid ASC, COALESCE(a.region, '') ASC, a.id ASC",
        )
        .map_err(|error| format!("Failed to prepare trashed account query: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(TrashedAccountRow {
                id: row.get(0)?,
                uid: row.get(1)?,
                region: row.get(2)?,
                nickname: row.get(3)?,
                avatar_path: row.get(4)?,
                total_pulls: row.get(5)?,
                last_pull_at: row.get(6)?,
                deleted_at: row.get(7)?,
            })
        })
        .map_err(|error| format!("Failed to query trashed accounts: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode trashed accounts: {error}"))
}

fn restore_trashed_warp_pull_in_database(
    connection: &mut Connection,
    input: &TrashWarpPullInput,
) -> Result<TrashWarpPullMutationResult, String> {
    validate_trash_warp_pull(input)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to start trash restore transaction: {error}"))?;
    let banner_id = transaction
        .query_row(
            "SELECT banner_id FROM warp_pulls
             WHERE id = ?1 AND account_id = ?2 AND deleted_at IS NOT NULL",
            params![&input.pull_id, &input.account_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Failed to read trashed warp pull: {error}"))?;
    let affected_pulls = transaction
        .execute(
            "UPDATE warp_pulls SET deleted_at = NULL
             WHERE id = ?1 AND account_id = ?2 AND deleted_at IS NOT NULL",
            params![&input.pull_id, &input.account_id],
        )
        .map_err(|error| format!("Failed to restore trashed warp pull: {error}"))?;

    if let Some(banner_id) = banner_id {
        recompute_pity_for_account_banner(&transaction, &input.account_id, &banner_id)?;
    }

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit trash restore: {error}"))?;

    Ok(TrashWarpPullMutationResult {
        account_id: input.account_id.clone(),
        pull_id: input.pull_id.clone(),
        affected_pulls,
    })
}

fn restore_trashed_account_in_database(
    connection: &mut Connection,
    input: &TrashAccountInput,
) -> Result<TrashAccountMutationResult, String> {
    validate_trash_account(input)?;
    let affected_accounts = connection
        .execute(
            "UPDATE accounts
             SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND deleted_at IS NOT NULL",
            params![&input.account_id],
        )
        .map_err(|error| format!("Failed to restore trashed account: {error}"))?;

    Ok(TrashAccountMutationResult {
        account_id: input.account_id.clone(),
        affected_accounts,
    })
}

fn permanently_delete_trashed_warp_pull_from_database(
    connection: &mut Connection,
    input: &TrashWarpPullInput,
) -> Result<TrashWarpPullMutationResult, String> {
    validate_trash_warp_pull(input)?;
    let affected_pulls = connection
        .execute(
            "DELETE FROM warp_pulls
             WHERE id = ?1 AND account_id = ?2 AND deleted_at IS NOT NULL",
            params![&input.pull_id, &input.account_id],
        )
        .map_err(|error| format!("Failed to permanently delete trashed warp pull: {error}"))?;

    Ok(TrashWarpPullMutationResult {
        account_id: input.account_id.clone(),
        pull_id: input.pull_id.clone(),
        affected_pulls,
    })
}

fn permanently_delete_trashed_account_from_database(
    connection: &mut Connection,
    input: &TrashAccountInput,
) -> Result<TrashAccountMutationResult, String> {
    validate_trash_account(input)?;
    let affected_accounts = connection
        .execute(
            "DELETE FROM accounts
             WHERE id = ?1 AND deleted_at IS NOT NULL",
            params![&input.account_id],
        )
        .map_err(|error| format!("Failed to permanently delete trashed account: {error}"))?;

    Ok(TrashAccountMutationResult {
        account_id: input.account_id.clone(),
        affected_accounts,
    })
}

fn purge_expired_trashed_warp_pulls(
    connection: &Connection,
    retention_days: i64,
) -> Result<usize, String> {
    validate_trash_retention_days(retention_days)?;
    if retention_days == 0 {
        return Ok(0);
    }

    connection
        .execute(
            "DELETE FROM warp_pulls
             WHERE deleted_at IS NOT NULL
               AND deleted_at <= datetime('now', ?1)",
            params![format!("-{retention_days} days")],
        )
        .map_err(|error| format!("Failed to purge expired Trash records: {error}"))
}

fn purge_expired_trashed_accounts(
    connection: &Connection,
    retention_days: i64,
) -> Result<usize, String> {
    validate_trash_retention_days(retention_days)?;
    if retention_days == 0 {
        return Ok(0);
    }

    connection
        .execute(
            "DELETE FROM accounts
             WHERE deleted_at IS NOT NULL
               AND deleted_at <= datetime('now', ?1)",
            params![format!("-{retention_days} days")],
        )
        .map_err(|error| format!("Failed to purge expired Trash accounts: {error}"))
}

fn build_warp_banner_summaries(
    pulls: Vec<WarpBannerSummaryCandidate>,
) -> Vec<WarpBannerSummaryRow> {
    let mut summaries = BTreeMap::<String, WarpBannerSummaryAccumulator>::new();

    for pull in pulls {
        let summary = summaries
            .entry(pull.banner_type.clone())
            .or_insert_with(|| WarpBannerSummaryAccumulator {
                banner_type: pull.banner_type.clone(),
                next_five_star_guaranteed: is_rate_up_banner(&pull.banner_type).then_some(false),
                ..WarpBannerSummaryAccumulator::default()
            });

        summary.total_pulls += 1;
        summary.current_four_star_pity += 1;
        summary.current_five_star_pity += 1;
        summary.last_pull_at = Some(pull.pulled_at.clone());
        summary.last_item_name = Some(pull.item_name.clone());
        summary.last_item_rarity = Some(pull.rarity);

        if pull.rarity == 5 {
            update_rate_up_outcome(summary, &pull.item_name, &pull.pulled_at);
            let five_star_pity = pull
                .manual_pity_override
                .unwrap_or(summary.current_five_star_pity);
            summary.five_star_count += 1;
            summary.five_star_pity_total += five_star_pity;
            summary.last_five_star_pity = Some(five_star_pity);
            summary.last_five_star_name = Some(pull.item_name);
            summary.current_four_star_pity = 0;
            summary.current_five_star_pity = 0;
        } else if pull.rarity == 4 {
            let four_star_pity = pull
                .manual_pity_override
                .unwrap_or(summary.current_four_star_pity);
            summary.four_star_count += 1;
            summary.four_star_pity_total += four_star_pity;
            summary.last_four_star_pity = Some(four_star_pity);
            summary.last_four_star_name = Some(pull.item_name);
            summary.current_four_star_pity = 0;
        }
    }

    summaries
        .into_values()
        .map(WarpBannerSummaryAccumulator::into_row)
        .collect()
}

fn update_rate_up_outcome(
    summary: &mut WarpBannerSummaryAccumulator,
    item_name: &str,
    pulled_at: &str,
) {
    let Some(outcome) = classify_rate_up_outcome(&summary.banner_type, item_name, pulled_at) else {
        return;
    };

    match outcome {
        RateUpOutcome::StandardLoss => {
            summary.rate_up_losses += 1;
            summary.rate_up_standard_losses += 1;
            summary.next_five_star_guaranteed = Some(true);
        }
        RateUpOutcome::Featured => {
            summary.rate_up_wins += 1;
            summary.next_five_star_guaranteed = Some(false);
        }
        RateUpOutcome::CelestialLoss => {
            summary.rate_up_losses += 1;
            summary.rate_up_celestial_losses += 1;
            summary.next_five_star_guaranteed = Some(true);
        }
    }
}

enum RateUpOutcome {
    Featured,
    StandardLoss,
    CelestialLoss,
}

const CELESTIAL_INVITATION_V3_2_START_DATE: &str = "2025-04-09";
const CELESTIAL_INVITATION_V4_2_START_DATE: &str = "2026-04-22";

fn classify_rate_up_outcome(
    banner_type: &str,
    item_name: &str,
    pulled_at: &str,
) -> Option<RateUpOutcome> {
    if !is_rate_up_banner(banner_type) {
        return None;
    }

    if is_known_off_rate_item(banner_type, item_name) {
        return Some(RateUpOutcome::StandardLoss);
    }

    if is_celestial_invitation_candidate(banner_type, item_name, pulled_at) {
        return Some(RateUpOutcome::CelestialLoss);
    }

    Some(RateUpOutcome::Featured)
}

fn is_rate_up_banner(banner_type: &str) -> bool {
    matches!(
        banner_type,
        "character_event"
            | "light_cone_event"
            | "collaboration_character"
            | "collaboration_light_cone"
    )
}

fn is_known_off_rate_item(banner_type: &str, item_name: &str) -> bool {
    if matches!(banner_type, "character_event" | "collaboration_character") {
        return matches!(
            item_name,
            "Bailu" | "Bronya" | "Clara" | "Gepard" | "Himeko" | "Welt" | "Yanqing"
        );
    }

    matches!(
        item_name,
        "But the Battle Isn't Over"
            | "In the Name of the World"
            | "Moment of Victory"
            | "Night on the Milky Way"
            | "Sleep Like the Dead"
            | "Something Irreplaceable"
            | "Time Waits for No One"
    )
}

fn is_celestial_invitation_candidate(banner_type: &str, item_name: &str, pulled_at: &str) -> bool {
    if !matches!(banner_type, "character_event" | "collaboration_character") {
        return false;
    }

    let pull_date = pulled_at.get(..10).unwrap_or(pulled_at);
    let added_in_version_3_2 = matches!(item_name, "Fu Xuan" | "Blade" | "Seele");
    let added_in_version_4_2 = matches!(item_name, "Yunli" | "Argenti" | "Silver Wolf");

    // Warp history omits both the featured banner and the user's seven selected
    // Celestial Invitation characters, so these outcomes cannot be labeled safely.
    (pull_date >= CELESTIAL_INVITATION_V3_2_START_DATE && added_in_version_3_2)
        || (pull_date >= CELESTIAL_INVITATION_V4_2_START_DATE && added_in_version_4_2)
}

fn export_backup_snapshot_to_directory(
    connection: &Connection,
    backup_directory: &Path,
) -> Result<ExportBackupSnapshotResult, String> {
    let snapshot = build_backup_snapshot(connection)?;
    let content_hash = calculate_backup_content_hash(&snapshot)?;
    let backup_path = backup_directory.join(create_backup_file_name()?);
    write_backup_snapshot(&snapshot, backup_directory, &backup_path)?;
    mark_local_backup_synced(connection, &content_hash, &snapshot.exported_at)?;

    Ok(to_export_backup_snapshot_result(&snapshot, &backup_path))
}

fn save_auto_backup_snapshot_to_directory(
    connection: &Connection,
    backup_directory: &Path,
) -> Result<AutoBackupSnapshotFile, String> {
    let snapshot = build_backup_snapshot(connection)?;
    let content_hash = calculate_backup_content_hash(&snapshot)?;
    let backup_path = backup_directory.join(AUTO_BACKUP_FILE_NAME);
    let state = read_backup_sync_state(connection)?;
    let changed =
        state.local_content_hash.as_deref() != Some(content_hash.as_str()) || !backup_path.exists();

    if changed {
        write_backup_snapshot(&snapshot, backup_directory, &backup_path)?;
        mark_local_backup_synced(connection, &content_hash, &snapshot.exported_at)?;
    }

    let bytes = fs::read(&backup_path)
        .map_err(|error| format!("Failed to read local autosave snapshot: {error}"))?;

    Ok(AutoBackupSnapshotFile {
        backup_path: backup_path.to_string_lossy().to_string(),
        file_name: AUTO_BACKUP_FILE_NAME.to_string(),
        bytes,
        content_hash,
        exported_at: snapshot.exported_at,
        changed,
        warp_pulls: snapshot.warp_pulls.len(),
    })
}

fn write_backup_snapshot(
    snapshot: &BackupSnapshot,
    backup_directory: &Path,
    backup_path: &Path,
) -> Result<(), String> {
    let payload = serde_json::to_string_pretty(snapshot)
        .map_err(|error| format!("Failed to serialize backup snapshot: {error}"))?;

    fs::create_dir_all(backup_directory)
        .map_err(|error| format!("Failed to create backup directory: {error}"))?;
    fs::write(backup_path, payload)
        .map_err(|error| format!("Failed to write backup snapshot: {error}"))
}

fn to_export_backup_snapshot_result(
    snapshot: &BackupSnapshot,
    backup_path: &Path,
) -> ExportBackupSnapshotResult {
    ExportBackupSnapshotResult {
        backup_path: backup_path.to_string_lossy().to_string(),
        exported_at: snapshot.exported_at.clone(),
        accounts: snapshot.accounts.len(),
        banners: snapshot.banners.len(),
        warp_items: snapshot.warp_items.len(),
        import_batches: snapshot.import_batches.len(),
        warp_pulls: snapshot.warp_pulls.len(),
    }
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

fn replace_database_from_backup_snapshot_file(
    connection: &mut Connection,
    backup_path: &Path,
) -> Result<RestoreBackupSnapshotResult, String> {
    if backup_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| !extension.eq_ignore_ascii_case("json"))
        .unwrap_or(true)
    {
        return Err("Backup import file must be a .json file.".to_string());
    }

    let payload = fs::read_to_string(backup_path)
        .map_err(|error| format!("Failed to read backup snapshot: {error}"))?;
    let snapshot: BackupSnapshot = serde_json::from_str(&payload)
        .map_err(|error| format!("Failed to parse backup snapshot: {error}"))?;

    validate_backup_snapshot(&snapshot)?;
    replace_database_with_backup_snapshot(connection, &backup_path.to_string_lossy(), &snapshot)
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

fn replace_database_with_backup_snapshot(
    connection: &mut Connection,
    backup_source: &str,
    snapshot: &BackupSnapshot,
) -> Result<RestoreBackupSnapshotResult, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Failed to start backup replace transaction: {error}"))?;

    clear_restorable_history_tables(&transaction)?;
    restore_backup_accounts(&transaction, &snapshot.accounts)?;
    restore_backup_banners(&transaction, &snapshot.banners)?;
    restore_backup_warp_items(&transaction, &snapshot.warp_items)?;
    restore_backup_import_batches(&transaction, &snapshot.import_batches)?;
    let (warp_pulls_inserted, duplicate_warp_pulls) =
        restore_backup_warp_pulls(&transaction, &snapshot.warp_pulls)?;
    let recomputed_banners = recompute_pity_for_snapshot(&transaction, snapshot)?;

    transaction
        .commit()
        .map_err(|error| format!("Failed to commit backup replace transaction: {error}"))?;

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

fn clear_restorable_history_tables(transaction: &Transaction<'_>) -> Result<(), String> {
    for table_name in [
        "warp_pulls",
        "import_batches",
        "accounts",
        "banners",
        "warp_items",
    ] {
        transaction
            .execute(&format!("DELETE FROM {table_name}"), [])
            .map_err(|error| format!("Failed to clear {table_name}: {error}"))?;
    }

    Ok(())
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
                DATA_CHANGED_TRIGGER,
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

fn read_trash_retention_policy(connection: &Connection) -> Result<TrashRetentionPolicy, String> {
    connection
        .execute(
            "INSERT OR IGNORE INTO trash_retention_policy (id, retention_days)
             VALUES (1, ?1)",
            [DEFAULT_TRASH_RETENTION_DAYS],
        )
        .map_err(|error| format!("Failed to ensure Trash retention policy: {error}"))?;

    connection
        .query_row(
            "SELECT retention_days, updated_at
             FROM trash_retention_policy
             WHERE id = 1",
            [],
            |row| {
                Ok(TrashRetentionPolicy {
                    retention_days: row.get(0)?,
                    updated_at: row.get(1)?,
                })
            },
        )
        .map_err(|error| format!("Failed to read Trash retention policy: {error}"))
}

fn update_trash_retention_policy_in_database(
    connection: &Connection,
    retention_days: i64,
) -> Result<TrashRetentionPolicy, String> {
    validate_trash_retention_days(retention_days)?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("Failed to start Trash retention update: {error}"))?;
    transaction
        .execute(
            "INSERT INTO trash_retention_policy (id, retention_days, updated_at)
             VALUES (1, ?1, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
               retention_days = excluded.retention_days,
               updated_at = CURRENT_TIMESTAMP",
            [retention_days],
        )
        .map_err(|error| format!("Failed to update Trash retention policy: {error}"))?;

    purge_expired_trashed_warp_pulls(&transaction, retention_days)?;
    purge_expired_trashed_accounts(&transaction, retention_days)?;
    transaction
        .commit()
        .map_err(|error| format!("Failed to commit Trash retention update: {error}"))?;
    read_trash_retention_policy(connection)
}

fn validate_trash_retention_days(retention_days: i64) -> Result<(), String> {
    if ALLOWED_TRASH_RETENTION_DAYS.contains(&retention_days) {
        Ok(())
    } else {
        Err(format!(
            "Unsupported Trash retention period: {retention_days} days."
        ))
    }
}

fn ensure_cloud_backup_policy(connection: &Connection, provider: &str) -> Result<(), String> {
    connection
        .execute(
            "INSERT OR IGNORE INTO cloud_backup_policies (
               provider, auto_backup_enabled, trigger_name, min_interval_minutes
             )
             VALUES (?1, 0, ?2, 0)",
            params![provider, DATA_CHANGED_TRIGGER],
        )
        .map_err(|error| format!("Failed to ensure cloud backup policy for {provider}: {error}"))?;

    Ok(())
}

fn read_backup_sync_state(connection: &Connection) -> Result<BackupSyncState, String> {
    ensure_backup_sync_state(connection)?;

    connection
        .query_row(
            "SELECT local_content_hash, cloud_content_hash, local_backed_up_at, cloud_backed_up_at
             FROM backup_sync_state
             WHERE id = 1",
            [],
            |row| {
                Ok(BackupSyncState {
                    local_content_hash: row.get(0)?,
                    cloud_content_hash: row.get(1)?,
                    local_backed_up_at: row.get(2)?,
                    cloud_backed_up_at: row.get(3)?,
                })
            },
        )
        .map_err(|error| format!("Failed to read backup sync state: {error}"))
}

fn ensure_backup_sync_state(connection: &Connection) -> Result<(), String> {
    connection
        .execute(
            "INSERT OR IGNORE INTO backup_sync_state (id) VALUES (1)",
            [],
        )
        .map_err(|error| format!("Failed to ensure backup sync state: {error}"))?;

    Ok(())
}

fn mark_local_backup_synced(
    connection: &Connection,
    content_hash: &str,
    backed_up_at: &str,
) -> Result<(), String> {
    ensure_backup_sync_state(connection)?;

    connection
        .execute(
            "UPDATE backup_sync_state
             SET local_content_hash = ?1,
                 local_backed_up_at = ?2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = 1",
            params![content_hash, backed_up_at],
        )
        .map_err(|error| format!("Failed to update local backup sync state: {error}"))?;

    Ok(())
}

fn mark_cloud_backup_synced(
    connection: &Connection,
    content_hash: &str,
    backed_up_at: Option<&str>,
) -> Result<(), String> {
    ensure_backup_sync_state(connection)?;

    connection
        .execute(
            "UPDATE backup_sync_state
             SET cloud_content_hash = ?1,
                 cloud_backed_up_at = COALESCE(?2, CURRENT_TIMESTAMP),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = 1",
            params![content_hash, backed_up_at],
        )
        .map_err(|error| format!("Failed to update cloud backup sync state: {error}"))?;

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

fn calculate_backup_content_hash(snapshot: &BackupSnapshot) -> Result<String, String> {
    let payload = BackupContentHashPayload {
        schema_version: snapshot.schema_version,
        applied_migrations: &snapshot.applied_migrations,
        accounts: &snapshot.accounts,
        banners: &snapshot.banners,
        warp_items: &snapshot.warp_items,
        import_batches: &snapshot.import_batches,
        warp_pulls: &snapshot.warp_pulls,
    };
    let canonical_payload = serde_json::to_vec(&payload)
        .map_err(|error| format!("Failed to serialize backup content hash payload: {error}"))?;
    let digest = Sha256::digest(&canonical_payload);

    Ok(format!("{digest:x}"))
}

fn read_backup_accounts(connection: &Connection) -> Result<Vec<BackupAccountRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, uid, region, nickname, avatar_path, created_at, updated_at, deleted_at
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
                avatar_path: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                deleted_at: row.get(7)?,
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
                    sequence_in_timestamp_group, raw_item_name, pity_4, pity_5,
                    manual_pity_override, created_at, deleted_at
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
                manual_pity_override: row.get(14)?,
                created_at: row.get(15)?,
                deleted_at: row.get(16)?,
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
            "INSERT INTO accounts (
               id, uid, region, nickname, avatar_path, created_at, updated_at, deleted_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
               uid = excluded.uid,
               region = excluded.region,
               nickname = excluded.nickname,
               avatar_path = excluded.avatar_path,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at,
               deleted_at = excluded.deleted_at",
        )
        .map_err(|error| format!("Failed to prepare account restore statement: {error}"))?;

    for account in accounts {
        let avatar_path = normalize_account_avatar_path(account.avatar_path.as_deref());
        validate_account_avatar_path(avatar_path)?;

        statement
            .execute(params![
                &account.id,
                &account.uid,
                account.region.as_deref(),
                account.nickname.as_deref(),
                avatar_path,
                &account.created_at,
                &account.updated_at,
                account.deleted_at.as_deref(),
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
               sequence_in_timestamp_group, raw_item_name, pity_4, pity_5,
               manual_pity_override, created_at, deleted_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
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
                pull.manual_pity_override,
                &pull.created_at,
                pull.deleted_at.as_deref(),
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
        return Err("Backup snapshot was not created by Miku Warp.".to_string());
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

    snapshots.sort_by(|left, right| {
        right
            .exported_at
            .cmp(&left.exported_at)
            .then_with(|| right.file_name.cmp(&left.file_name))
    });

    Ok(snapshots)
}

fn list_trashed_backup_snapshots_in_directory(
    backup_trash_directory: &Path,
    retention_days: i64,
) -> Result<Vec<TrashedBackupSnapshotSummary>, String> {
    if !backup_trash_directory.exists() {
        return Ok(Vec::new());
    }

    purge_expired_trashed_backup_snapshots(backup_trash_directory, retention_days)?;
    let mut snapshots = Vec::new();

    for entry in fs::read_dir(backup_trash_directory)
        .map_err(|error| format!("Failed to read backup Trash directory: {error}"))?
    {
        let path = entry
            .map_err(|error| format!("Failed to read backup Trash directory entry: {error}"))?
            .path();

        if !is_backup_snapshot_file(&path) {
            continue;
        }

        if let Ok(summary) = read_trashed_backup_snapshot_summary(&path) {
            snapshots.push(summary);
        }
    }

    snapshots.sort_by(|left, right| {
        right
            .deleted_at_unix_ms
            .cmp(&left.deleted_at_unix_ms)
            .then_with(|| right.file_name.cmp(&left.file_name))
    });

    Ok(snapshots)
}

fn read_trashed_backup_snapshot_summary(
    path: &Path,
) -> Result<TrashedBackupSnapshotSummary, String> {
    let summary = read_backup_snapshot_summary(path)?;
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Failed to read backup Trash metadata: {error}"))?;
    let deleted_at_unix_ms = metadata
        .modified()
        .ok()
        .and_then(system_time_unix_ms)
        .unwrap_or(0);

    Ok(TrashedBackupSnapshotSummary {
        backup_path: summary.backup_path,
        file_name: summary.file_name,
        exported_at: summary.exported_at,
        deleted_at_unix_ms,
        size_bytes: summary.size_bytes,
        accounts: summary.accounts,
        banners: summary.banners,
        warp_items: summary.warp_items,
        import_batches: summary.import_batches,
        warp_pulls: summary.warp_pulls,
        uids: summary.uids,
    })
}

fn read_backup_snapshot_summary(path: &Path) -> Result<BackupSnapshotSummary, String> {
    let payload = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read backup snapshot: {error}"))?;
    let size_bytes = fs::metadata(path)
        .map_err(|error| format!("Failed to read backup snapshot metadata: {error}"))?
        .len();
    let snapshot: BackupSnapshot = serde_json::from_str(&payload)
        .map_err(|error| format!("Failed to parse backup snapshot: {error}"))?;

    validate_backup_snapshot(&snapshot)?;
    let uids = snapshot
        .accounts
        .iter()
        .map(|account| account.uid.clone())
        .collect();

    Ok(BackupSnapshotSummary {
        backup_path: path.to_string_lossy().to_string(),
        file_name: path
            .file_name()
            .and_then(|file_name| file_name.to_str())
            .unwrap_or("backup.json")
            .to_string(),
        exported_at: snapshot.exported_at,
        is_auto_save: path.file_name().and_then(|file_name| file_name.to_str())
            == Some(AUTO_BACKUP_FILE_NAME),
        size_bytes,
        accounts: snapshot.accounts.len(),
        banners: snapshot.banners.len(),
        warp_items: snapshot.warp_items.len(),
        import_batches: snapshot.import_batches.len(),
        warp_pulls: snapshot.warp_pulls.len(),
        uids,
    })
}

fn find_latest_backup_snapshot_path(backup_directory: &Path) -> Result<PathBuf, String> {
    let snapshots = list_backup_snapshots_in_directory(backup_directory)?;

    snapshots
        .first()
        .map(|snapshot| PathBuf::from(&snapshot.backup_path))
        .ok_or_else(|| "No local backup snapshots found yet.".to_string())
}

fn move_backup_snapshot_file_to_trash(
    backup_directory: &Path,
    backup_trash_directory: &Path,
    backup_path: &Path,
) -> Result<DeleteBackupSnapshotResult, String> {
    let file_name = backup_path
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .ok_or_else(|| "Backup snapshot file name is invalid.".to_string())?
        .to_string();
    if file_name == AUTO_BACKUP_FILE_NAME {
        return Err(
            "Autosave backup is kept for safety and cannot be deleted manually.".to_string(),
        );
    }

    fs::create_dir_all(backup_trash_directory)
        .map_err(|error| format!("Failed to create backup Trash directory: {error}"))?;
    let trash_path = backup_trash_directory.join(&file_name);

    if trash_path.exists() {
        return Err("This backup is already in Trash.".to_string());
    }

    fs::copy(backup_path, &trash_path)
        .map_err(|error| format!("Failed to move backup snapshot to Trash: {error}"))?;
    fs::remove_file(backup_path)
        .map_err(|error| format!("Failed to remove original backup snapshot: {error}"))?;

    let remaining_snapshots = list_backup_snapshots_in_directory(backup_directory)?.len();

    Ok(DeleteBackupSnapshotResult {
        backup_path: trash_path.to_string_lossy().to_string(),
        file_name,
        remaining_snapshots,
    })
}

fn restore_trashed_backup_snapshot_file(
    backup_directory: &Path,
    backup_trash_directory: &Path,
    backup_path: &Path,
    retention_days: i64,
) -> Result<DeleteBackupSnapshotResult, String> {
    let file_name = backup_path
        .file_name()
        .and_then(|file_name| file_name.to_str())
        .ok_or_else(|| "Backup snapshot file name is invalid.".to_string())?
        .to_string();
    let restored_path = backup_directory.join(&file_name);

    if restored_path.exists() {
        return Err("A local backup with this file name already exists.".to_string());
    }

    fs::create_dir_all(backup_directory)
        .map_err(|error| format!("Failed to create backup directory: {error}"))?;
    fs::copy(backup_path, &restored_path)
        .map_err(|error| format!("Failed to restore backup snapshot from Trash: {error}"))?;
    fs::remove_file(backup_path)
        .map_err(|error| format!("Failed to remove restored backup from Trash: {error}"))?;

    let remaining_snapshots =
        list_trashed_backup_snapshots_in_directory(backup_trash_directory, retention_days)?.len();

    Ok(DeleteBackupSnapshotResult {
        backup_path: restored_path.to_string_lossy().to_string(),
        file_name,
        remaining_snapshots,
    })
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
    if file_name == AUTO_BACKUP_FILE_NAME {
        return Err(
            "Autosave backup is kept for safety and cannot be deleted manually.".to_string(),
        );
    }

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

fn purge_expired_trashed_backup_snapshots(
    backup_trash_directory: &Path,
    retention_days: i64,
) -> Result<usize, String> {
    validate_trash_retention_days(retention_days)?;
    if retention_days == 0 || !backup_trash_directory.exists() {
        return Ok(0);
    }

    let retention_seconds = u64::try_from(retention_days)
        .map_err(|_| "Trash retention days cannot be negative.".to_string())?
        .saturating_mul(24 * 60 * 60);
    let now = SystemTime::now();
    let mut purged = 0;

    for entry in fs::read_dir(backup_trash_directory)
        .map_err(|error| format!("Failed to read backup Trash directory: {error}"))?
    {
        let path = entry
            .map_err(|error| format!("Failed to read backup Trash directory entry: {error}"))?
            .path();

        if !is_backup_snapshot_file(&path) {
            continue;
        }

        let is_expired = fs::metadata(&path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| now.duration_since(modified).ok())
            .map(|age| age.as_secs() >= retention_seconds)
            .unwrap_or(false);

        if is_expired && fs::remove_file(&path).is_ok() {
            purged += 1;
        }
    }

    Ok(purged)
}

fn system_time_unix_ms(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| u64::try_from(duration.as_millis()).unwrap_or(u64::MAX))
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

    (file_name.starts_with("warp-tracker-backup-") || file_name == AUTO_BACKUP_FILE_NAME)
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
    validate_account_id(&query.account_id, "Warp pull query account id")?;

    if let Some(banner_type) = &query.banner_type {
        banner_label(banner_type)?;
    }

    if matches!(query.limit, Some(0)) {
        return Err("Warp pull query limit must be greater than zero.".to_string());
    }

    if matches!(query.rarity, Some(rarity) if !matches!(rarity, 3 | 4 | 5)) {
        return Err("Warp pull query rarity must be 3, 4, or 5.".to_string());
    }

    Ok(())
}

fn validate_delete_warp_pull(input: &DeleteWarpPullInput) -> Result<(), String> {
    validate_account_id(&input.account_id, "Delete warp pull account id")?;

    if input.pull_id.trim().is_empty() {
        return Err("Delete warp pull id cannot be empty.".to_string());
    }

    Ok(())
}

fn validate_list_warp_banner_summaries_query(
    query: &ListWarpBannerSummariesInput,
) -> Result<(), String> {
    validate_account_id(&query.account_id, "Warp banner summary query account id")?;

    Ok(())
}

fn validate_account_id(account_id: &str, label: &str) -> Result<(), String> {
    if account_id.trim().is_empty() {
        return Err(format!("{label} cannot be empty."));
    }

    Ok(())
}

fn normalize_account_avatar_path(avatar_path: Option<&str>) -> Option<&str> {
    avatar_path.map(str::trim).filter(|value| !value.is_empty())
}

fn validate_account_avatar_path(avatar_path: Option<&str>) -> Result<(), String> {
    let Some(avatar_path) = normalize_account_avatar_path(avatar_path) else {
        return Ok(());
    };

    let is_valid_avatar_path = avatar_path.starts_with("icon/avatar/")
        && avatar_path.ends_with(".png")
        && !avatar_path.contains("..")
        && !avatar_path.contains('\\');

    if !is_valid_avatar_path {
        return Err("Avatar must be a StarRailRes avatar icon.".to_string());
    }

    Ok(())
}

fn validate_trash_warp_pull(input: &TrashWarpPullInput) -> Result<(), String> {
    validate_account_id(&input.account_id, "Trash account id")?;

    if input.pull_id.trim().is_empty() {
        return Err("Trash pull id cannot be empty.".to_string());
    }

    Ok(())
}

fn validate_trash_account(input: &TrashAccountInput) -> Result<(), String> {
    validate_account_id(&input.account_id, "Trash account id")
}

fn validate_delete_warp_pulls(input: &DeleteWarpPullsInput) -> Result<(), String> {
    validate_account_id(&input.account_id, "History account id")?;

    if input.pull_ids.is_empty() {
        return Err("Select at least one history item to delete.".to_string());
    }

    if input.pull_ids.len() > 500 {
        return Err("At most 500 history items can be deleted at once.".to_string());
    }

    if input
        .pull_ids
        .iter()
        .any(|pull_id| pull_id.trim().is_empty())
    {
        return Err("Selected history pull ids cannot be empty.".to_string());
    }

    Ok(())
}

fn query_limit(query: &ListWarpPullsInput) -> usize {
    query.limit.unwrap_or(5).clamp(1, 500)
}

fn query_offset(query: &ListWarpPullsInput) -> usize {
    query.offset.unwrap_or(0).min(100_000)
}

fn normalized_search_filter(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(80).collect())
}

fn map_warp_pull_row(row: &Row<'_>) -> rusqlite::Result<WarpPullRow> {
    Ok(WarpPullRow {
        id: row.get(0)?,
        banner_type: row.get(1)?,
        item_name: row.get(2)?,
        item_type: row.get(3)?,
        rarity: row.get(4)?,
        icon_path: row.get(5)?,
        pulled_at: row.get(6)?,
        source: row.get(7)?,
        pity_four_at_pull: row.get(8)?,
        pity_five_at_pull: row.get(9)?,
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
                "SELECT wp.id, wi.rarity, wp.manual_pity_override
                 FROM warp_pulls wp
                 INNER JOIN warp_items wi ON wi.id = wp.warp_item_id
                 WHERE wp.account_id = ?1
                   AND wp.banner_id = ?2
                   AND wp.deleted_at IS NULL
                 ORDER BY wp.pulled_at ASC, wp.sequence_in_timestamp_group ASC, wp.id ASC",
            )
            .map_err(|error| format!("Failed to prepare pity recompute query: {error}"))?;
        let rows = statement
            .query_map(params![account_id, banner_id], |row| {
                Ok(WarpPullPityCandidate {
                    id: row.get(0)?,
                    rarity: row.get(1)?,
                    manual_pity_override: row.get(2)?,
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
            Some(pull.manual_pity_override.unwrap_or(four_star_pity))
        } else {
            None
        };
        let pity_five_at_pull = if pull.rarity == 5 {
            Some(pull.manual_pity_override.unwrap_or(five_star_pity))
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

fn validate_game_history_import(input: &SaveGameHistoryImportInput) -> Result<(), String> {
    if input.account.id.trim().is_empty() {
        return Err("Game history import account id cannot be empty.".to_string());
    }

    if input.account.uid.trim().is_empty() {
        return Err("Game history import account uid cannot be empty.".to_string());
    }

    if input.records_found < input.pulls.len() {
        return Err(
            "Game history import records found cannot be lower than ready pulls.".to_string(),
        );
    }

    for pull in &input.pulls {
        validate_game_history_pull(pull)?;
    }

    Ok(())
}

fn validate_game_history_pull(pull: &SaveGameHistoryPullInput) -> Result<(), String> {
    banner_label(&pull.banner_type)?;

    if pull.gacha_id.trim().is_empty() {
        return Err(format!(
            "Game history pull {} at {} has an empty gacha id.",
            pull.raw_item_name, pull.pulled_at
        ));
    }

    if pull.pulled_at.trim().is_empty() {
        return Err(format!(
            "Game history pull {} has an empty timestamp.",
            pull.raw_item_name
        ));
    }

    if pull.sequence_in_timestamp_group < 1 {
        return Err(format!(
            "Game history pull {} at {} has invalid sequence.",
            pull.raw_item_name, pull.pulled_at
        ));
    }

    if pull.raw_item_name.trim().is_empty() {
        return Err(format!(
            "Game history pull {} at {} has an empty item name.",
            pull.gacha_id, pull.pulled_at
        ));
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

    if !matches!(pull.pity_override, None | Some(1..=999)) {
        return Err(format!(
            "Manual import pull {} has an invalid pity override.",
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
               deleted_at = NULL,
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

struct ManualImportRestoreInput<'a> {
    pull_id: &'a str,
    account_id: &'a str,
    banner_id: &'a str,
    warp_item_id: &'a str,
    pulled_at: &'a str,
    pulled_at_timezone: Option<&'a str>,
    import_batch_id: &'a str,
    source_line_number: i64,
    sequence_in_timestamp_group: i64,
    raw_item_name: &'a str,
    pity_override: Option<i64>,
}

fn restore_trashed_manual_import_pull(
    transaction: &Transaction<'_>,
    input: ManualImportRestoreInput<'_>,
) -> Result<bool, String> {
    let affected_rows = transaction
        .execute(
            "UPDATE warp_pulls
             SET account_id = ?2,
                 banner_id = ?3,
                 warp_item_id = ?4,
                 pulled_at = ?5,
                 pulled_at_timezone = ?6,
                 source_import_id = ?7,
                 source_line_number = ?8,
                 sequence_in_timestamp_group = ?9,
                 raw_item_name = ?10,
                 manual_pity_override = ?11,
                 deleted_at = NULL
             WHERE id = ?1 AND deleted_at IS NOT NULL",
            params![
                input.pull_id,
                input.account_id,
                input.banner_id,
                input.warp_item_id,
                input.pulled_at,
                input.pulled_at_timezone,
                input.import_batch_id,
                input.source_line_number,
                input.sequence_in_timestamp_group,
                input.raw_item_name,
                input.pity_override,
            ],
        )
        .map_err(|error| {
            format!(
                "Failed to restore manual import pull {} from Trash: {error}",
                input.pull_id
            )
        })?;

    Ok(affected_rows > 0)
}

fn merge_source_account_history(
    transaction: &Transaction<'_>,
    source_account_id: Option<&str>,
    target_account_id: &str,
) -> Result<AccountHistoryMergeResult, String> {
    let Some(source_account_id) = source_account_id
        .map(str::trim)
        .filter(|source_account_id| !source_account_id.is_empty())
    else {
        return Ok(AccountHistoryMergeResult::default());
    };

    if source_account_id == target_account_id {
        return Ok(AccountHistoryMergeResult::default());
    }

    let source_exists = transaction
        .query_row(
            "SELECT 1 FROM accounts WHERE id = ?1",
            params![source_account_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|error| format!("Failed to check source account {source_account_id}: {error}"))?;

    if source_exists.is_none() {
        return Ok(AccountHistoryMergeResult::default());
    }

    let mut merge_result = AccountHistoryMergeResult::default();

    for game_pull in game_history_pulls_for_account(transaction, target_account_id)? {
        if let Some(manual_pull_id) = find_nearest_manual_pull_for_game_history(
            transaction,
            source_account_id,
            &game_pull.banner_id,
            &game_pull.pulled_at,
            game_pull.sequence_in_timestamp_group,
        )? {
            enrich_manual_pull_with_game_history(transaction, &manual_pull_id, &game_pull)?;
            transaction
                .execute(
                    "DELETE FROM warp_pulls WHERE id = ?1",
                    params![&game_pull.id],
                )
                .map_err(|error| {
                    format!(
                        "Failed to remove duplicate game history pull {}: {error}",
                        game_pull.id
                    )
                })?;
            merge_result
                .affected_banner_ids
                .insert(game_pull.banner_id.clone());
            merge_result.matched_game_history_count += 1;
        }
    }

    for banner_id in banner_ids_for_account(transaction, source_account_id)? {
        merge_result.affected_banner_ids.insert(banner_id);
    }

    merge_result.moved_pull_count = transaction
        .execute(
            "UPDATE warp_pulls SET account_id = ?1 WHERE account_id = ?2",
            params![target_account_id, source_account_id],
        )
        .map_err(|error| {
            format!(
                "Failed to move pulls from account {source_account_id} to {target_account_id}: {error}"
            )
        })?;

    transaction
        .execute(
            "UPDATE import_batches SET account_id = ?1 WHERE account_id = ?2",
            params![target_account_id, source_account_id],
        )
        .map_err(|error| {
            format!(
                "Failed to move import batches from account {source_account_id} to {target_account_id}: {error}"
            )
        })?;

    transaction
        .execute(
            "DELETE FROM accounts WHERE id = ?1",
            params![source_account_id],
        )
        .map_err(|error| format!("Failed to remove merged account {source_account_id}: {error}"))?;

    Ok(merge_result)
}

fn game_history_pulls_for_account(
    transaction: &Transaction<'_>,
    account_id: &str,
) -> Result<Vec<GameHistoryDuplicateCandidate>, String> {
    let mut statement = transaction
        .prepare(
            "SELECT id, banner_id, warp_item_id, pulled_at, pulled_at_timezone, gacha_id,
                    sequence_in_timestamp_group, raw_item_name
             FROM warp_pulls
             WHERE account_id = ?1 AND source = 'game_history' AND gacha_id IS NOT NULL
             ORDER BY pulled_at ASC, sequence_in_timestamp_group ASC, id ASC",
        )
        .map_err(|error| format!("Failed to prepare game history duplicate query: {error}"))?;
    let rows = statement
        .query_map(params![account_id], |row| {
            Ok(GameHistoryDuplicateCandidate {
                id: row.get(0)?,
                banner_id: row.get(1)?,
                warp_item_id: row.get(2)?,
                pulled_at: row.get(3)?,
                pulled_at_timezone: row.get(4)?,
                gacha_id: row.get(5)?,
                sequence_in_timestamp_group: row.get(6)?,
                raw_item_name: row.get(7)?,
            })
        })
        .map_err(|error| format!("Failed to query game history duplicate rows: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode game history duplicate rows: {error}"))
}

fn find_nearest_manual_pull_for_game_history(
    transaction: &Transaction<'_>,
    account_id: &str,
    banner_id: &str,
    pulled_at: &str,
    sequence_in_timestamp_group: i64,
) -> Result<Option<String>, String> {
    transaction
        .query_row(
            "SELECT id
             FROM warp_pulls
             WHERE account_id = ?1
               AND banner_id = ?2
               AND source = 'manual'
               AND gacha_id IS NULL
               AND deleted_at IS NULL
               AND sequence_in_timestamp_group = ?3
               AND ABS(strftime('%s', pulled_at) - strftime('%s', ?4)) <= 7200
             ORDER BY ABS(strftime('%s', pulled_at) - strftime('%s', ?4)) ASC,
                      pulled_at ASC,
                      id ASC
             LIMIT 1",
            params![
                account_id,
                banner_id,
                sequence_in_timestamp_group,
                pulled_at,
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Failed to match manual pull for game history: {error}"))
}

fn find_nearest_trashed_manual_pull_for_game_history(
    transaction: &Transaction<'_>,
    account_id: &str,
    banner_id: &str,
    pulled_at: &str,
    sequence_in_timestamp_group: i64,
) -> Result<Option<String>, String> {
    transaction
        .query_row(
            "SELECT id
             FROM warp_pulls
             WHERE account_id = ?1
               AND banner_id = ?2
               AND source = 'manual'
               AND gacha_id IS NULL
               AND deleted_at IS NOT NULL
               AND sequence_in_timestamp_group = ?3
               AND ABS(strftime('%s', pulled_at) - strftime('%s', ?4)) <= 7200
             ORDER BY ABS(strftime('%s', pulled_at) - strftime('%s', ?4)) ASC,
                      pulled_at ASC,
                      id ASC
             LIMIT 1",
            params![
                account_id,
                banner_id,
                sequence_in_timestamp_group,
                pulled_at,
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Failed to match trashed manual pull for game history: {error}"))
}

fn enrich_manual_pull_with_game_history(
    transaction: &Transaction<'_>,
    manual_pull_id: &str,
    game_pull: &GameHistoryDuplicateCandidate,
) -> Result<(), String> {
    transaction
        .execute(
            "UPDATE warp_pulls
             SET warp_item_id = ?2,
                 pulled_at = ?3,
                 pulled_at_timezone = COALESCE(?4, pulled_at_timezone),
                 gacha_id = ?5,
                 sequence_in_timestamp_group = ?6,
                 raw_item_name = COALESCE(?7, raw_item_name),
                 manual_pity_override = NULL
             WHERE id = ?1",
            params![
                manual_pull_id,
                &game_pull.warp_item_id,
                &game_pull.pulled_at,
                game_pull.pulled_at_timezone.as_deref(),
                &game_pull.gacha_id,
                game_pull.sequence_in_timestamp_group,
                game_pull.raw_item_name.as_deref(),
            ],
        )
        .map_err(|error| format!("Failed to enrich manual pull {manual_pull_id}: {error}"))?;

    Ok(())
}

fn restore_trashed_manual_pull_with_game_history(
    transaction: &Transaction<'_>,
    manual_pull_id: &str,
    game_pull: &GameHistoryDuplicateCandidate,
    import_batch_id: &str,
    source_line_number: i64,
) -> Result<(), String> {
    transaction
        .execute(
            "UPDATE warp_pulls
             SET warp_item_id = ?2,
                 pulled_at = ?3,
                 pulled_at_timezone = COALESCE(?4, pulled_at_timezone),
                 gacha_id = ?5,
                 source_import_id = ?6,
                 source_line_number = ?7,
                 sequence_in_timestamp_group = ?8,
                 raw_item_name = COALESCE(?9, raw_item_name),
                 manual_pity_override = NULL,
                 deleted_at = NULL
             WHERE id = ?1 AND deleted_at IS NOT NULL",
            params![
                manual_pull_id,
                &game_pull.warp_item_id,
                &game_pull.pulled_at,
                game_pull.pulled_at_timezone.as_deref(),
                &game_pull.gacha_id,
                import_batch_id,
                source_line_number,
                game_pull.sequence_in_timestamp_group,
                game_pull.raw_item_name.as_deref(),
            ],
        )
        .map_err(|error| {
            format!("Failed to restore manual pull {manual_pull_id} from Trash: {error}")
        })?;

    Ok(())
}

fn restore_trashed_game_history_pull_by_gacha(
    transaction: &Transaction<'_>,
    account_id: &str,
    banner_id: &str,
    gacha_id: &str,
    game_pull: &GameHistoryDuplicateCandidate,
    import_batch_id: &str,
    source_line_number: i64,
) -> Result<bool, String> {
    let affected_rows = transaction
        .execute(
            "UPDATE warp_pulls
             SET warp_item_id = ?4,
                 pulled_at = ?5,
                 pulled_at_timezone = COALESCE(?6, pulled_at_timezone),
                 source_import_id = ?7,
                 source_line_number = ?8,
                 sequence_in_timestamp_group = ?9,
                 raw_item_name = COALESCE(?10, raw_item_name),
                 deleted_at = NULL
             WHERE account_id = ?1
               AND banner_id = ?2
               AND gacha_id = ?3
               AND deleted_at IS NOT NULL",
            params![
                account_id,
                banner_id,
                gacha_id,
                &game_pull.warp_item_id,
                &game_pull.pulled_at,
                game_pull.pulled_at_timezone.as_deref(),
                import_batch_id,
                source_line_number,
                game_pull.sequence_in_timestamp_group,
                game_pull.raw_item_name.as_deref(),
            ],
        )
        .map_err(|error| {
            format!("Failed to restore game history pull {gacha_id} from Trash: {error}")
        })?;

    Ok(affected_rows > 0)
}

fn active_game_history_gacha_exists(
    transaction: &Transaction<'_>,
    account_id: &str,
    banner_id: &str,
    gacha_id: &str,
) -> Result<bool, String> {
    transaction
        .query_row(
            "SELECT 1 FROM warp_pulls
             WHERE account_id = ?1
               AND banner_id = ?2
               AND gacha_id = ?3
               AND deleted_at IS NULL",
            params![account_id, banner_id, gacha_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(|error| format!("Failed to check game history duplicate {gacha_id}: {error}"))
}

fn banner_ids_for_account(
    transaction: &Transaction<'_>,
    account_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = transaction
        .prepare("SELECT DISTINCT banner_id FROM warp_pulls WHERE account_id = ?1")
        .map_err(|error| format!("Failed to prepare account banner query: {error}"))?;
    let rows = statement
        .query_map(params![account_id], |row| row.get::<_, String>(0))
        .map_err(|error| format!("Failed to query account banners: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to decode account banners: {error}"))
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

fn warp_item_id_for_game_history_pull(
    transaction: &Transaction<'_>,
    pull: &SaveGameHistoryPullInput,
) -> Result<String, String> {
    if let Some(source_id) = pull
        .item_source_id
        .as_ref()
        .filter(|source_id| !source_id.trim().is_empty())
    {
        let item_id = transaction
            .query_row(
                "SELECT id FROM warp_items WHERE source_id = ?1",
                params![source_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| {
                format!(
                    "Failed to look up catalog item {} by source id {}: {error}",
                    pull.raw_item_name, source_id
                )
            })?;

        if let Some(item_id) = item_id {
            return Ok(item_id);
        }
    }

    let item_id = transaction
        .query_row(
            "SELECT id FROM warp_items WHERE name = ?1",
            params![&pull.raw_item_name],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| {
            format!(
                "Failed to look up catalog item {} by name: {error}",
                pull.raw_item_name
            )
        })?;

    item_id.ok_or_else(|| {
        format!(
            "Game history item {} is not in the local catalog. Sync the catalog before importing.",
            pull.raw_item_name
        )
    })
}

fn record_game_history_import_notes(
    transaction: &Transaction<'_>,
    import_batch_id: &str,
    input: &SaveGameHistoryImportInput,
) -> Result<(), String> {
    let notes = [
        input
            .source_endpoint_host
            .as_ref()
            .map(|host| format!("endpoint={host}")),
        input
            .source_cache_path
            .as_ref()
            .map(|path| format!("cache={path}")),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join("\n");

    if notes.is_empty() {
        return Ok(());
    }

    transaction
        .execute(
            "UPDATE import_batches SET notes = ?2 WHERE id = ?1",
            params![import_batch_id, notes],
        )
        .map_err(|error| format!("Failed to record game history import notes: {error}"))?;

    Ok(())
}

fn insert_import_batch(
    transaction: &Transaction<'_>,
    import_batch_id: &str,
    account_id: &str,
    source: &str,
    banner_type: Option<&str>,
    records_found: usize,
) -> Result<(), String> {
    transaction
        .execute(
            "INSERT INTO import_batches (
               id, account_id, source, banner_type, records_found, records_inserted,
               records_skipped, status
             )
             VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 'pending')",
            params![
                import_batch_id,
                account_id,
                source,
                banner_type,
                records_found as i64
            ],
        )
        .map_err(|error| format!("Failed to insert {source} import batch: {error}"))?;

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
        .map_err(|error| format!("Failed to update import batch result: {error}"))?;

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

fn create_import_batch_id(prefix: &str) -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock is before UNIX epoch: {error}"))?
        .as_nanos();

    Ok(format!("{prefix}-{timestamp}"))
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

fn game_history_pull_id(account_id: &str, banner_id: &str, gacha_id: &str) -> String {
    format!("game-history:{account_id}:{banner_id}:{gacha_id}")
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

impl WarpBannerSummaryAccumulator {
    fn into_row(self) -> WarpBannerSummaryRow {
        WarpBannerSummaryRow {
            banner_type: self.banner_type,
            total_pulls: self.total_pulls,
            current_four_star_pity: self.current_four_star_pity,
            current_five_star_pity: self.current_five_star_pity,
            four_star_count: self.four_star_count,
            five_star_count: self.five_star_count,
            four_star_pity_total: self.four_star_pity_total,
            five_star_pity_total: self.five_star_pity_total,
            rate_up_wins: self.rate_up_wins,
            rate_up_losses: self.rate_up_losses,
            rate_up_standard_losses: self.rate_up_standard_losses,
            rate_up_celestial_losses: self.rate_up_celestial_losses,
            next_five_star_guaranteed: self.next_five_star_guaranteed,
            last_four_star_pity: self.last_four_star_pity,
            last_five_star_pity: self.last_five_star_pity,
            last_four_star_name: self.last_four_star_name,
            last_five_star_name: self.last_five_star_name,
            last_pull_at: self.last_pull_at,
            last_item_name: self.last_item_name,
            last_item_rarity: self.last_item_rarity,
        }
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
        let backup_sync_state_table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'backup_sync_state'",
                [],
                |row| row.get(0),
            )
            .expect("backup sync state table count");
        let trash_retention_policy_table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'table' AND name = 'trash_retention_policy'",
                [],
                |row| row.get(0),
            )
            .expect("Trash retention policy table count");
        let account_deleted_at_column_count: i64 = connection
            .query_row(
                "SELECT COUNT(*)
                 FROM pragma_table_info('accounts')
                 WHERE name = 'deleted_at'",
                [],
                |row| row.get(0),
            )
            .expect("account deleted_at column count");
        let manual_pity_override_column_count: i64 = connection
            .query_row(
                "SELECT COUNT(*)
                 FROM pragma_table_info('warp_pulls')
                 WHERE name = 'manual_pity_override'",
                [],
                |row| row.get(0),
            )
            .expect("manual pity override column count");

        assert_eq!(applied_migrations, planned_migrations());
        assert_eq!(table_count, 1);
        assert_eq!(unique_name_index_count, 0);
        assert_eq!(name_index_count, 1);
        assert_eq!(cloud_snapshot_table_count, 1);
        assert_eq!(cloud_event_table_count, 1);
        assert_eq!(cloud_policy_table_count, 1);
        assert_eq!(backup_sync_state_table_count, 1);
        assert_eq!(trash_retention_policy_table_count, 1);
        assert_eq!(account_deleted_at_column_count, 1);
        assert_eq!(manual_pity_override_column_count, 1);
    }

    #[test]
    fn manages_trash_retention_policy_with_an_allowlist() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");

        let initial = read_trash_retention_policy(&connection).expect("default policy");
        let updated = update_trash_retention_policy_in_database(&connection, 90)
            .expect("supported retention updates");
        let invalid = update_trash_retention_policy_in_database(&connection, 17);

        assert_eq!(initial.retention_days, DEFAULT_TRASH_RETENTION_DAYS);
        assert_eq!(updated.retention_days, 90);
        assert!(invalid.is_err());
        assert_eq!(
            read_trash_retention_policy(&connection)
                .expect("stored policy")
                .retention_days,
            90
        );
    }

    #[test]
    fn never_retention_does_not_purge_old_trash() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");
        connection
            .execute(
                "INSERT INTO accounts (id, uid, deleted_at)
                 VALUES ('account-old-trash', '800000001', datetime('now', '-2 years'))",
                [],
            )
            .expect("old trashed account inserts");

        let purged =
            purge_expired_trashed_accounts(&connection, 0).expect("Never retention skips purge");

        assert_eq!(purged, 0);
        assert_eq!(count_table(&connection, "accounts"), 1);
    }

    #[test]
    fn reconciles_account_avatar_column_when_migration_metadata_is_missing() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("initial migrations apply");
        connection
            .execute(
                "INSERT INTO accounts (id, uid, avatar_path) VALUES (?1, ?2, ?3)",
                params!["account-1", "800000000", "icon/avatar/1001.png"],
            )
            .expect("account with avatar");
        connection
            .execute(
                "DELETE FROM schema_migrations WHERE version = ?1",
                [ACCOUNT_AVATAR_VERSION],
            )
            .expect("remove account avatar migration metadata");

        apply_migrations(&connection).expect("migration metadata is reconciled");

        let applied_migrations =
            list_applied_migrations(&connection).expect("migration table can be read");
        let avatar_column_count: i64 = connection
            .query_row(
                "SELECT COUNT(*)
                 FROM pragma_table_info('accounts')
                 WHERE name = ?1",
                [ACCOUNT_AVATAR_COLUMN],
                |row| row.get(0),
            )
            .expect("avatar column count");
        let avatar_path: Option<String> = connection
            .query_row(
                "SELECT avatar_path FROM accounts WHERE id = ?1",
                ["account-1"],
                |row| row.get(0),
            )
            .expect("stored avatar path");

        assert_eq!(applied_migrations, planned_migrations());
        assert_eq!(avatar_column_count, 1);
        assert_eq!(avatar_path.as_deref(), Some("icon/avatar/1001.png"));
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
    fn reimporting_manual_pulls_restores_matching_trash_records() {
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
        let draft = manual_import_draft();

        save_manual_import_draft_to_database(&mut connection, &draft).expect("first import");
        let active_pulls = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: None,
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("active pulls can be listed");
        delete_warp_pulls_from_database(
            &mut connection,
            &DeleteWarpPullsInput {
                account_id: "account-1".to_string(),
                pull_ids: active_pulls
                    .pulls
                    .iter()
                    .map(|pull| pull.id.clone())
                    .collect(),
            },
        )
        .expect("pulls move to Trash");

        let second = save_manual_import_draft_to_database(&mut connection, &draft)
            .expect("second import restores Trash");
        let restored_pulls = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: None,
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("restored pulls can be listed");
        let trash = list_trashed_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: None,
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("Trash can be listed");

        assert_eq!(second.records_inserted, 0);
        assert_eq!(second.records_restored, 2);
        assert_eq!(second.duplicate_records, 0);
        assert_eq!(second.records_skipped, 0);
        assert_eq!(restored_pulls.total, 2);
        assert_eq!(trash.total, 0);
        assert_eq!(count_table(&connection, "warp_pulls"), 2);
    }

    #[test]
    fn saves_game_history_import_and_deduplicates_by_gacha_id() {
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

        let first = save_game_history_import_to_database(&mut connection, &game_history_import())
            .expect("first game history import");
        let second = save_game_history_import_to_database(&mut connection, &game_history_import())
            .expect("second game history import");
        let pulls = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-800000001".to_string(),
                banner_type: Some("character_event".to_string()),
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("game history pulls can be listed")
        .pulls;

        assert_eq!(first.records_found, 2);
        assert_eq!(first.records_inserted, 2);
        assert_eq!(first.records_skipped, 0);
        assert_eq!(first.duplicate_records, 0);
        assert_eq!(second.records_inserted, 0);
        assert_eq!(second.records_skipped, 2);
        assert_eq!(second.duplicate_records, 2);
        assert_eq!(count_table(&connection, "import_batches"), 2);
        assert_eq!(count_table(&connection, "warp_pulls"), 2);
        assert_eq!(pulls[1].item_name, "Pela");
        assert_eq!(pulls[1].source, "game_history");
        assert_eq!(pulls[1].pity_four_at_pull, Some(1));
    }

    #[test]
    fn reimporting_game_history_restores_matching_trash_records() {
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
        let import = game_history_import();

        save_game_history_import_to_database(&mut connection, &import).expect("first import");
        let active_pulls = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-800000001".to_string(),
                banner_type: None,
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("active pulls can be listed");
        delete_warp_pulls_from_database(
            &mut connection,
            &DeleteWarpPullsInput {
                account_id: "account-800000001".to_string(),
                pull_ids: active_pulls
                    .pulls
                    .iter()
                    .map(|pull| pull.id.clone())
                    .collect(),
            },
        )
        .expect("pulls move to Trash");

        let second = save_game_history_import_to_database(&mut connection, &import)
            .expect("second import restores Trash");
        let restored_pulls = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-800000001".to_string(),
                banner_type: None,
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("restored pulls can be listed");
        let trash = list_trashed_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-800000001".to_string(),
                banner_type: None,
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("Trash can be listed");

        assert_eq!(second.records_inserted, 0);
        assert_eq!(second.records_restored, 2);
        assert_eq!(second.duplicate_records, 0);
        assert_eq!(second.records_skipped, 0);
        assert_eq!(restored_pulls.total, 2);
        assert_eq!(trash.total, 0);
        assert_eq!(count_table(&connection, "warp_pulls"), 2);
    }

    #[test]
    fn merges_placeholder_manual_history_into_detected_game_account() {
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

        save_game_history_import_to_database(&mut connection, &game_history_import())
            .expect("existing game import");
        save_manual_import_draft_to_database(&mut connection, &manual_import_draft())
            .expect("placeholder manual import");

        let mut merged_import = game_history_import();
        merged_import.merge_from_account_id = Some("account-1".to_string());
        let result = save_game_history_import_to_database(&mut connection, &merged_import)
            .expect("merged game import");
        let pulls = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-800000001".to_string(),
                banner_type: Some("character_event".to_string()),
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("merged pulls can be listed")
        .pulls;
        let source_account_rows: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM accounts WHERE id = 'account-1'",
                [],
                |row| row.get(0),
            )
            .expect("source account count");
        let game_history_rows: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM warp_pulls WHERE account_id = 'account-800000001' AND source = 'game_history'",
                [],
                |row| row.get(0),
            )
            .expect("game row count");

        assert_eq!(result.records_inserted, 0);
        assert_eq!(result.duplicate_records, 2);
        assert_eq!(result.manual_records_merged, 2);
        assert_eq!(result.manual_records_matched, 2);
        assert_eq!(source_account_rows, 0);
        assert_eq!(game_history_rows, 0);
        assert_eq!(pulls.len(), 2);
        assert!(pulls.iter().all(|pull| pull.source == "manual"));
        assert!(pulls
            .iter()
            .any(|pull| pull.item_name == "Pela" && pull.pity_four_at_pull == Some(1)));
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
        assert_eq!(snapshot["accounts"][0]["uid"].as_str(), Some("800000000"));
        assert_eq!(snapshot["warpPulls"].as_array().map(Vec::len), Some(2));
        assert_eq!(snapshots.len(), 1);
        assert_eq!(snapshots[0].warp_pulls, 2);
        assert_eq!(snapshots[0].backup_path, result.backup_path);

        std::fs::remove_dir_all(backup_directory).ok();
    }

    #[test]
    fn save_auto_backup_snapshot_skips_unchanged_content() {
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

        let backup_directory = unique_test_dir("backup-autosave");
        let first = save_auto_backup_snapshot_to_directory(&connection, &backup_directory)
            .expect("first autosave");
        let second = save_auto_backup_snapshot_to_directory(&connection, &backup_directory)
            .expect("second autosave");
        let snapshots = list_backup_snapshots_in_directory(&backup_directory).expect("backup list");

        assert_eq!(first.file_name, AUTO_BACKUP_FILE_NAME);
        assert!(first.changed);
        assert!(!second.changed);
        assert_eq!(first.content_hash, second.content_hash);
        assert_eq!(snapshots.len(), 1);
        assert!(snapshots[0].is_auto_save);
        assert!(snapshots[0].size_bytes > 0);
        assert_eq!(snapshots[0].warp_pulls, 2);

        std::fs::remove_dir_all(backup_directory).ok();
    }

    #[test]
    fn moves_backup_snapshot_file_to_trash_after_validation() {
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
        let delete_result = move_backup_snapshot_file_to_trash(
            &backup_directory,
            &backup_directory.join("trash"),
            &backup_path,
        )
        .expect("backup delete");
        let trashed = list_trashed_backup_snapshots_in_directory(
            &backup_directory.join("trash"),
            DEFAULT_TRASH_RETENTION_DAYS,
        )
        .expect("backup trash list");

        assert_eq!(delete_result.remaining_snapshots, 0);
        assert_eq!(
            delete_result.file_name,
            backup_path
                .file_name()
                .and_then(|file_name| file_name.to_str())
                .expect("backup file name")
        );
        assert!(!backup_path.exists());
        assert_eq!(trashed.len(), 1);
        assert_eq!(trashed[0].file_name, delete_result.file_name);
        assert!(PathBuf::from(&delete_result.backup_path).exists());

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
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("restored pulls can be listed")
        .pulls;

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
        let restored_pela = restored_pulls
            .iter()
            .find(|pull| pull.item_name == "Pela")
            .expect("Pela is restored");
        assert_eq!(restored_pela.pity_four_at_pull, Some(1));

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
    fn moves_single_pull_to_trash_and_restores_it_with_recomputed_pity() {
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
        save_manual_import_draft_to_database(
            &mut connection,
            &manual_import_draft_with_pulls(vec![
                manual_import_pull("character_event", "light-cone-2001", "Data Bank", 1),
                manual_import_pull("character_event", "character-1001", "Pela", 2),
                manual_import_pull("character_event", "character-1002", "Sparkle", 3),
            ]),
        )
        .expect("manual import");
        let pela_pull_id = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: Some("character_event".to_string()),
                limit: Some(10),
                offset: None,
                search: Some("Pela".to_string()),
                rarity: Some(4),
            },
        )
        .expect("Pela can be listed")
        .pulls[0]
            .id
            .clone();

        let delete_result = delete_warp_pull_from_database(
            &mut connection,
            &DeleteWarpPullInput {
                account_id: "account-1".to_string(),
                pull_id: pela_pull_id,
            },
        )
        .expect("single pull delete");
        let pulls = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: Some("character_event".to_string()),
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("remaining pulls can be listed")
        .pulls;
        let sparkle = pulls
            .iter()
            .find(|pull| pull.item_name == "Sparkle")
            .expect("Sparkle remains");

        assert_eq!(delete_result.deleted_pulls, 1);
        assert!(delete_result.recomputed_banner);
        assert_eq!(pulls.len(), 2);
        assert!(!pulls.iter().any(|pull| pull.item_name == "Pela"));
        assert_eq!(sparkle.pity_four_at_pull, Some(2));
        assert_eq!(sparkle.pity_five_at_pull, Some(2));

        let trash = list_trashed_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: None,
                limit: Some(5),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("trash can be listed");
        assert_eq!(trash.total, 1);
        assert_eq!(trash.pulls[0].item_name, "Pela");

        let restore_result = restore_trashed_warp_pull_in_database(
            &mut connection,
            &TrashWarpPullInput {
                account_id: "account-1".to_string(),
                pull_id: trash.pulls[0].id.clone(),
            },
        )
        .expect("trash pull restores");
        let restored_pulls = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: Some("character_event".to_string()),
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("restored pulls can be listed")
        .pulls;
        let restored_sparkle = restored_pulls
            .iter()
            .find(|pull| pull.item_name == "Sparkle")
            .expect("Sparkle remains after restore");

        assert_eq!(restore_result.affected_pulls, 1);
        assert_eq!(restored_pulls.len(), 3);
        assert_eq!(restored_sparkle.pity_five_at_pull, Some(3));
    }

    #[test]
    fn moves_selected_history_to_trash_in_one_transaction() {
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
                banner_type: None,
                limit: Some(5),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("history list")
        .pulls;

        let result = delete_warp_pulls_from_database(
            &mut connection,
            &DeleteWarpPullsInput {
                account_id: "account-1".to_string(),
                pull_ids: pulls.iter().map(|pull| pull.id.clone()).collect(),
            },
        )
        .expect("selected history moves to Trash");
        let trash = list_trashed_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: None,
                limit: Some(5),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("Trash list");

        assert_eq!(result.requested_pulls, 2);
        assert_eq!(result.deleted_pulls, 2);
        assert_eq!(result.recomputed_banners, 1);
        assert_eq!(trash.total, 2);
    }

    #[test]
    fn deletes_all_history_for_selected_account_without_removing_account() {
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
        save_game_history_import_to_database(&mut connection, &game_history_import())
            .expect("second account game import");

        let delete_result = delete_account_warp_history_from_database(
            &mut connection,
            &DeleteAccountWarpHistoryInput {
                account_id: "account-1".to_string(),
            },
        )
        .expect("account history delete");
        let accounts = list_accounts_from_database(&connection).expect("accounts list");
        let source_account = accounts
            .iter()
            .find(|account| account.id == "account-1")
            .expect("deleted history account remains");
        let other_account = accounts
            .iter()
            .find(|account| account.id == "account-800000001")
            .expect("other account remains");

        assert_eq!(delete_result.deleted_pulls, 2);
        assert_eq!(delete_result.deleted_import_batches, 0);
        assert_eq!(source_account.total_pulls, 0);
        assert_eq!(other_account.total_pulls, 2);

        let trash = list_trashed_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: None,
                limit: Some(5),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("account trash can be listed");
        assert_eq!(trash.total, 2);
    }

    #[test]
    fn moves_inactive_account_to_trash_and_restores_or_permanently_deletes_it() {
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
        save_game_history_import_to_database(&mut connection, &game_history_import())
            .expect("second account game import");

        let delete_result = delete_account_from_database(
            &mut connection,
            &DeleteAccountInput {
                account_id: "account-800000001".to_string(),
            },
        )
        .expect("account moves to Trash");
        let active_accounts = list_accounts_from_database(&connection).expect("active accounts");
        let trashed_accounts =
            list_trashed_accounts_from_database(&connection).expect("trashed accounts");
        let hidden_history = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-800000001".to_string(),
                banner_type: None,
                limit: Some(5),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("deleted account history is hidden");

        assert_eq!(delete_result.affected_accounts, 1);
        assert_eq!(delete_result.total_pulls, 2);
        assert_eq!(active_accounts.len(), 1);
        assert_eq!(active_accounts[0].id, "account-1");
        assert_eq!(trashed_accounts.len(), 1);
        assert_eq!(trashed_accounts[0].id, "account-800000001");
        assert_eq!(trashed_accounts[0].total_pulls, 2);
        assert_eq!(hidden_history.total, 0);

        let restore_result = restore_trashed_account_in_database(
            &mut connection,
            &TrashAccountInput {
                account_id: "account-800000001".to_string(),
            },
        )
        .expect("account restores");
        let restored_accounts = list_accounts_from_database(&connection).expect("restored list");

        assert_eq!(restore_result.affected_accounts, 1);
        assert_eq!(restored_accounts.len(), 2);

        delete_account_from_database(
            &mut connection,
            &DeleteAccountInput {
                account_id: "account-800000001".to_string(),
            },
        )
        .expect("account moves to Trash again");
        let permanent_result = permanently_delete_trashed_account_from_database(
            &mut connection,
            &TrashAccountInput {
                account_id: "account-800000001".to_string(),
            },
        )
        .expect("trashed account deletes permanently");
        let account_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM accounts WHERE id = 'account-800000001'",
                [],
                |row| row.get(0),
            )
            .expect("account count");
        let pull_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM warp_pulls WHERE account_id = 'account-800000001'",
                [],
                |row| row.get(0),
            )
            .expect("pull count");

        assert_eq!(permanent_result.affected_accounts, 1);
        assert_eq!(account_count, 0);
        assert_eq!(pull_count, 0);
    }

    #[test]
    fn permanently_deletes_trashed_pull_and_purges_only_expired_rows() {
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
                banner_type: None,
                limit: Some(5),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("history list")
        .pulls;

        for pull in &pulls {
            delete_warp_pull_from_database(
                &mut connection,
                &DeleteWarpPullInput {
                    account_id: "account-1".to_string(),
                    pull_id: pull.id.clone(),
                },
            )
            .expect("pull moves to trash");
        }

        let permanent_result = permanently_delete_trashed_warp_pull_from_database(
            &mut connection,
            &TrashWarpPullInput {
                account_id: "account-1".to_string(),
                pull_id: pulls[0].id.clone(),
            },
        )
        .expect("permanent delete succeeds");
        connection
            .execute(
                "UPDATE warp_pulls SET deleted_at = datetime('now', '-7 months')
                 WHERE id = ?1",
                params![&pulls[1].id],
            )
            .expect("trash timestamp ages");
        let purged = purge_expired_trashed_warp_pulls(&connection, DEFAULT_TRASH_RETENTION_DAYS)
            .expect("expired trash purges");

        assert_eq!(permanent_result.affected_pulls, 1);
        assert_eq!(purged, 1);
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM warp_pulls", [], |row| row
                    .get::<_, i64>(0))
                .expect("remaining pull count"),
            0
        );
    }

    #[test]
    fn replaces_local_history_from_json_backup_file() {
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
        let backup_directory = unique_test_dir("backup-replace");
        let export_result =
            export_backup_snapshot_to_directory(&source_connection, &backup_directory)
                .expect("backup export");

        let mut target_connection = Connection::open_in_memory().expect("target database");
        apply_migrations(&target_connection).expect("target migration applies");
        upsert_warp_item_catalog(
            &mut target_connection,
            &[
                catalog_item("character-1001", "1001", "Pela", "character", 4),
                catalog_item("light-cone-2001", "2001", "Data Bank", "light_cone", 3),
            ],
        )
        .expect("target catalog sync");
        save_game_history_import_to_database(&mut target_connection, &game_history_import())
            .expect("target game import");

        let replace_result = replace_database_from_backup_snapshot_file(
            &mut target_connection,
            &PathBuf::from(&export_result.backup_path),
        )
        .expect("replace from json backup");
        let accounts = list_accounts_from_database(&target_connection).expect("accounts list");
        let pulls = list_warp_pulls_from_database(
            &target_connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: None,
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("restored account pulls")
        .pulls;

        assert_eq!(replace_result.warp_pulls_inserted, 2);
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].id, "account-1");
        assert_eq!(pulls.len(), 2);
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
        assert_eq!(default_policy.trigger_name, DATA_CHANGED_TRIGGER);
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
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("saved pulls can be listed")
        .pulls;

        assert_eq!(pulls.len(), 2);
        assert_eq!(pulls[0].banner_type, "character_event");
        assert_eq!(pulls[0].item_name, "Data Bank");
        assert_eq!(pulls[0].item_type, "light_cone");
        assert_eq!(pulls[0].rarity, 3);
        assert_eq!(pulls[0].source, "manual");
        assert_eq!(pulls[0].pity_four_at_pull, None);
        assert_eq!(pulls[0].pity_five_at_pull, None);
        assert_eq!(pulls[1].item_name, "Pela");
        assert_eq!(pulls[1].item_type, "character");
        assert_eq!(pulls[1].rarity, 4);
        assert_eq!(pulls[1].pity_four_at_pull, Some(1));
        assert_eq!(pulls[1].pity_five_at_pull, None);
    }

    #[test]
    fn summarizes_saved_warp_pulls_by_banner() {
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
        save_manual_import_draft_to_database(
            &mut connection,
            &manual_import_draft_with_pulls(vec![
                manual_import_pull("character_event", "character-1001", "Pela", 1),
                manual_import_pull("character_event", "light-cone-2001", "Data Bank", 2),
                manual_import_pull("character_event", "character-1002", "Sparkle", 3),
            ]),
        )
        .expect("character event import");
        save_manual_import_draft_to_database(
            &mut connection,
            &manual_import_draft_with_pulls(vec![
                manual_import_pull("standard", "light-cone-2001", "Data Bank", 1),
                manual_import_pull("standard", "character-1001", "Pela", 2),
            ]),
        )
        .expect("standard import");

        let summaries = list_warp_banner_summaries_from_database(
            &connection,
            &ListWarpBannerSummariesInput {
                account_id: "account-1".to_string(),
            },
        )
        .expect("summaries can be listed");
        let character_event = summaries
            .iter()
            .find(|summary| summary.banner_type == "character_event")
            .expect("character event summary");
        let standard = summaries
            .iter()
            .find(|summary| summary.banner_type == "standard")
            .expect("standard summary");

        assert_eq!(summaries.len(), 2);
        assert_eq!(character_event.total_pulls, 3);
        assert_eq!(character_event.five_star_count, 1);
        assert_eq!(character_event.five_star_pity_total, 3);
        assert_eq!(character_event.last_five_star_pity, Some(3));
        assert_eq!(
            character_event.last_five_star_name,
            Some("Sparkle".to_string())
        );
        assert_eq!(character_event.current_five_star_pity, 0);
        assert_eq!(standard.total_pulls, 2);
        assert_eq!(standard.four_star_count, 1);
        assert_eq!(standard.four_star_pity_total, 2);
        assert_eq!(standard.last_four_star_pity, Some(2));
        assert_eq!(standard.current_four_star_pity, 0);
        assert_eq!(standard.current_five_star_pity, 2);
        assert_eq!(standard.last_item_name, Some("Pela".to_string()));
    }

    #[test]
    fn summarizes_every_featured_five_star_as_a_rate_up_win() {
        let summaries = build_warp_banner_summaries(vec![
            WarpBannerSummaryCandidate {
                banner_type: "character_event".to_string(),
                item_name: "Sparkle".to_string(),
                manual_pity_override: None,
                rarity: 5,
                pulled_at: "2025-01-01T00:00:01Z".to_string(),
            },
            WarpBannerSummaryCandidate {
                banner_type: "character_event".to_string(),
                item_name: "Yanqing".to_string(),
                manual_pity_override: None,
                rarity: 5,
                pulled_at: "2025-01-01T00:00:02Z".to_string(),
            },
            WarpBannerSummaryCandidate {
                banner_type: "character_event".to_string(),
                item_name: "Acheron".to_string(),
                manual_pity_override: None,
                rarity: 5,
                pulled_at: "2025-01-01T00:00:03Z".to_string(),
            },
            WarpBannerSummaryCandidate {
                banner_type: "character_event".to_string(),
                item_name: "Firefly".to_string(),
                manual_pity_override: None,
                rarity: 5,
                pulled_at: "2025-01-01T00:00:04Z".to_string(),
            },
            WarpBannerSummaryCandidate {
                banner_type: "standard".to_string(),
                item_name: "Bronya".to_string(),
                manual_pity_override: None,
                rarity: 5,
                pulled_at: "2025-01-01T00:00:05Z".to_string(),
            },
        ]);
        let character_event = summaries
            .iter()
            .find(|summary| summary.banner_type == "character_event")
            .expect("character event summary");
        let standard = summaries
            .iter()
            .find(|summary| summary.banner_type == "standard")
            .expect("standard summary");

        assert_eq!(character_event.rate_up_wins, 3);
        assert_eq!(character_event.rate_up_losses, 1);
        assert_eq!(character_event.rate_up_standard_losses, 1);
        assert_eq!(character_event.rate_up_celestial_losses, 0);
        assert_eq!(character_event.next_five_star_guaranteed, Some(false));
        assert_eq!(standard.rate_up_wins, 0);
        assert_eq!(standard.rate_up_losses, 0);
        assert_eq!(standard.rate_up_standard_losses, 0);
        assert_eq!(standard.rate_up_celestial_losses, 0);
        assert_eq!(standard.next_five_star_guaranteed, None);
    }

    #[test]
    fn counts_standard_and_celestial_invitation_losses_separately() {
        let summaries = build_warp_banner_summaries(vec![
            WarpBannerSummaryCandidate {
                banner_type: "character_event".to_string(),
                item_name: "Fu Xuan".to_string(),
                manual_pity_override: None,
                rarity: 5,
                pulled_at: "2025-04-08T23:59:59Z".to_string(),
            },
            WarpBannerSummaryCandidate {
                banner_type: "character_event".to_string(),
                item_name: "Blade".to_string(),
                manual_pity_override: None,
                rarity: 5,
                pulled_at: "2025-04-09T00:00:00Z".to_string(),
            },
            WarpBannerSummaryCandidate {
                banner_type: "character_event".to_string(),
                item_name: "Sparkle".to_string(),
                manual_pity_override: None,
                rarity: 5,
                pulled_at: "2025-05-01T00:00:00Z".to_string(),
            },
            WarpBannerSummaryCandidate {
                banner_type: "character_event".to_string(),
                item_name: "Yanqing".to_string(),
                manual_pity_override: None,
                rarity: 5,
                pulled_at: "2025-06-01T00:00:00Z".to_string(),
            },
            WarpBannerSummaryCandidate {
                banner_type: "character_event".to_string(),
                item_name: "Seele".to_string(),
                manual_pity_override: None,
                rarity: 5,
                pulled_at: "2025-07-01T00:00:00Z".to_string(),
            },
            WarpBannerSummaryCandidate {
                banner_type: "character_event".to_string(),
                item_name: "Yunli".to_string(),
                manual_pity_override: None,
                rarity: 5,
                pulled_at: "2026-04-21T23:59:59Z".to_string(),
            },
            WarpBannerSummaryCandidate {
                banner_type: "character_event".to_string(),
                item_name: "Argenti".to_string(),
                manual_pity_override: None,
                rarity: 5,
                pulled_at: "2026-04-22T00:00:00Z".to_string(),
            },
        ]);
        let summary = summaries
            .iter()
            .find(|summary| summary.banner_type == "character_event")
            .expect("character event summary");

        assert_eq!(summary.rate_up_wins, 3);
        assert_eq!(summary.rate_up_losses, 4);
        assert_eq!(summary.rate_up_standard_losses, 1);
        assert_eq!(summary.rate_up_celestial_losses, 3);
        assert_eq!(summary.next_five_star_guaranteed, Some(true));
    }

    #[test]
    fn classifies_collaboration_history_rate_up_results() {
        let pulls = [
            ("Saber", "2025-07-11T11:23:51"),
            ("Fu Xuan", "2025-07-11T11:28:44"),
            ("Saber", "2025-07-11T11:33:00"),
            ("Seele", "2025-07-12T15:00:32"),
            ("Archer", "2025-07-21T06:20:23"),
            ("Bronya", "2025-08-02T06:48:18"),
            ("Archer", "2025-08-21T06:32:20"),
            ("Bronya", "2025-09-15T04:27:36"),
            ("Saber", "2025-09-15T04:31:41"),
        ]
        .into_iter()
        .map(|(item_name, pulled_at)| WarpBannerSummaryCandidate {
            banner_type: "collaboration_character".to_string(),
            item_name: item_name.to_string(),
            manual_pity_override: None,
            rarity: 5,
            pulled_at: pulled_at.to_string(),
        })
        .collect();

        let summary = build_warp_banner_summaries(pulls)
            .into_iter()
            .next()
            .expect("collaboration character summary");

        assert_eq!(summary.rate_up_wins, 5);
        assert_eq!(summary.rate_up_losses, 4);
        assert_eq!(summary.rate_up_standard_losses, 2);
        assert_eq!(summary.rate_up_celestial_losses, 2);
        assert_eq!(summary.next_five_star_guaranteed, Some(false));
    }

    #[test]
    fn expands_celestial_invitation_candidates_by_version() {
        assert!(matches!(
            classify_rate_up_outcome("character_event", "Blade", "2025-04-09 00:00:00"),
            Some(RateUpOutcome::CelestialLoss)
        ));
        assert!(matches!(
            classify_rate_up_outcome("character_event", "Yunli", "2026-04-21 23:59:59"),
            Some(RateUpOutcome::Featured)
        ));
        assert!(matches!(
            classify_rate_up_outcome(
                "collaboration_character",
                "Silver Wolf",
                "2026-04-22 00:00:00"
            ),
            Some(RateUpOutcome::CelestialLoss)
        ));
        assert!(matches!(
            classify_rate_up_outcome(
                "character_event",
                "Silver Wolf LV.999",
                "2026-04-22 00:00:00"
            ),
            Some(RateUpOutcome::Featured)
        ));
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
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("saved pulls can be listed")
        .pulls;

        assert_eq!(pulls[2].item_name, "Data Bank");
        assert_eq!(pulls[2].pity_four_at_pull, None);
        assert_eq!(pulls[2].pity_five_at_pull, None);
        assert_eq!(pulls[1].item_name, "Pela");
        assert_eq!(pulls[1].pity_four_at_pull, Some(2));
        assert_eq!(pulls[1].pity_five_at_pull, None);
        assert_eq!(pulls[0].item_name, "Sparkle");
        assert_eq!(pulls[0].pity_four_at_pull, Some(1));
        assert_eq!(pulls[0].pity_five_at_pull, Some(3));
    }

    #[test]
    fn preserves_manual_pity_override_in_history_summary_and_backup() {
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        apply_migrations(&connection).expect("migration applies");
        upsert_warp_item_catalog(
            &mut connection,
            &[
                catalog_item("light-cone-2001", "2001", "Data Bank", "light_cone", 3),
                catalog_item("character-1002", "1002", "Sparkle", "character", 5),
            ],
        )
        .expect("catalog sync");
        let mut sparkle = manual_import_pull("character_event", "character-1002", "Sparkle", 2);
        sparkle.pity_override = Some(77);
        let draft = manual_import_draft_with_pulls(vec![
            manual_import_pull("character_event", "light-cone-2001", "Data Bank", 1),
            sparkle,
        ]);

        save_manual_import_draft_to_database(&mut connection, &draft).expect("manual import");

        let pulls = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: Some("character_event".to_string()),
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
            },
        )
        .expect("saved pulls can be listed")
        .pulls;
        let summaries = list_warp_banner_summaries_from_database(
            &connection,
            &ListWarpBannerSummariesInput {
                account_id: "account-1".to_string(),
            },
        )
        .expect("summary can be listed");
        let backup_pulls = read_backup_warp_pulls(&connection).expect("backup pulls can be read");

        assert_eq!(pulls[0].item_name, "Sparkle");
        assert_eq!(pulls[0].pity_five_at_pull, Some(77));
        assert_eq!(summaries[0].last_five_star_pity, Some(77));
        assert_eq!(summaries[0].five_star_pity_total, 77);
        assert_eq!(backup_pulls[1].manual_pity_override, Some(77));
    }

    #[test]
    fn paginates_and_filters_warp_pull_history() {
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

        let first_page = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: Some("character_event".to_string()),
                limit: Some(2),
                offset: Some(0),
                search: None,
                rarity: None,
            },
        )
        .expect("first page");
        let second_page = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: Some("character_event".to_string()),
                limit: Some(2),
                offset: Some(2),
                search: None,
                rarity: None,
            },
        )
        .expect("second page");
        let filtered = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: Some("character_event".to_string()),
                limit: Some(5),
                offset: Some(0),
                search: Some("pela".to_string()),
                rarity: Some(4),
            },
        )
        .expect("filtered page");

        assert_eq!(first_page.total, 3);
        assert_eq!(first_page.pulls.len(), 2);
        assert_eq!(first_page.pulls[0].item_name, "Sparkle");
        assert_eq!(second_page.pulls.len(), 1);
        assert_eq!(second_page.pulls[0].item_name, "Data Bank");
        assert_eq!(filtered.total, 1);
        assert_eq!(filtered.pulls[0].item_name, "Pela");
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
                offset: None,
                search: None,
                rarity: None,
            },
        );
        let zero_limit_result = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: None,
                limit: Some(0),
                offset: None,
                search: None,
                rarity: None,
            },
        );
        let unsupported_banner_result = list_warp_pulls_from_database(
            &connection,
            &ListWarpPullsInput {
                account_id: "account-1".to_string(),
                banner_type: Some("unknown".to_string()),
                limit: Some(10),
                offset: None,
                search: None,
                rarity: None,
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
                uid: "800000000".to_string(),
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
            pity_override: None,
            source_line_number: sequence_in_timestamp_group + 2,
            sequence_in_timestamp_group,
            raw_item_name: raw_item_name.to_string(),
        }
    }

    fn game_history_import() -> SaveGameHistoryImportInput {
        SaveGameHistoryImportInput {
            account: ManualImportAccountInput {
                id: "account-800000001".to_string(),
                uid: "800000001".to_string(),
                region: Some("asia".to_string()),
                nickname: Some("Saki".to_string()),
            },
            merge_from_account_id: None,
            records_found: 2,
            source_cache_path: Some(
                "C:\\Games\\StarRail_Data\\webCaches\\Cache_Data\\data_2".to_string(),
            ),
            source_endpoint_host: Some("public-operation-hkrpg-sg.hoyoverse.com".to_string()),
            pulls: vec![
                game_history_pull(
                    "character_event",
                    "1001",
                    "game-gacha-1",
                    "Pela",
                    "2025-07-11T11:20:01",
                    1,
                ),
                game_history_pull(
                    "character_event",
                    "2001",
                    "game-gacha-2",
                    "Data Bank",
                    "2025-07-11T11:20:01",
                    2,
                ),
            ],
        }
    }

    fn game_history_pull(
        banner_type: &str,
        item_source_id: &str,
        gacha_id: &str,
        raw_item_name: &str,
        pulled_at: &str,
        sequence_in_timestamp_group: i64,
    ) -> SaveGameHistoryPullInput {
        SaveGameHistoryPullInput {
            banner_type: banner_type.to_string(),
            item_source_id: Some(item_source_id.to_string()),
            gacha_id: gacha_id.to_string(),
            pulled_at: pulled_at.to_string(),
            pulled_at_timezone: None,
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
