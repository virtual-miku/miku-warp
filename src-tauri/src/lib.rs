pub mod cloud_backup;
mod database;
mod game_history;
mod roster;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoBackupRunResult {
    content_hash: String,
    local_changed: bool,
    local_backup_path: String,
    local_exported_at: String,
    warp_pulls: usize,
    cloud_required: bool,
    cloud_uploaded: bool,
    cloud_error: Option<String>,
    sync_status: database::AutoBackupSyncStatus,
}

#[tauri::command]
fn get_cloud_backup_status() -> cloud_backup::CloudBackupStatus {
    cloud_backup::get_cloud_backup_status()
}

#[tauri::command]
fn connect_google_drive_backup(
    input: Option<cloud_backup::GoogleOAuthClientInput>,
) -> Result<cloud_backup::CloudBackupStatus, String> {
    cloud_backup::connect_google_drive_backup(input)
}

#[tauri::command]
fn cancel_google_drive_backup_connection() -> Result<cloud_backup::CloudBackupStatus, String> {
    cloud_backup::cancel_google_drive_backup_connection()
}

#[tauri::command]
fn disconnect_google_drive_backup() -> Result<cloud_backup::CloudBackupStatus, String> {
    cloud_backup::disconnect_google_drive_backup()
}

#[tauri::command]
async fn upload_latest_google_drive_backup(
    app: tauri::AppHandle,
) -> Result<cloud_backup::UploadCloudBackupSnapshotResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let backup_snapshot = database::save_auto_backup_snapshot(&app)?;

        let upload_result = cloud_backup::upload_google_drive_backup_snapshot(
            &backup_snapshot.backup_path,
            &backup_snapshot.file_name,
            &backup_snapshot.bytes,
        )?;
        let sync_status = database::mark_cloud_auto_backup_synced(
            &app,
            &backup_snapshot.content_hash,
            upload_result.remote_modified_time.as_deref(),
        )?;

        record_cloud_backup_audit(
            &app,
            database::RecordCloudBackupSnapshotInput {
                provider: "google_drive".to_string(),
                remote_file_id: upload_result.remote_file_id.clone(),
                file_name: upload_result.remote_file_name.clone(),
                remote_md5_checksum: upload_result.remote_md5_checksum.clone(),
                remote_modified_time: upload_result.remote_modified_time.clone(),
                size_bytes: i64::try_from(upload_result.bytes_uploaded).ok(),
                operation: "upload".to_string(),
                status: "success".to_string(),
                message: Some(format!(
                    "Uploaded autosave backup after {} pulls. Pending: {}.",
                    backup_snapshot.warp_pulls, sync_status.has_pending_backup
                )),
            },
        );

        Ok(upload_result)
    })
    .await
    .map_err(|error| format!("Google Drive upload task failed: {error}"))?
}

#[tauri::command]
async fn run_auto_backup(app: tauri::AppHandle) -> Result<AutoBackupRunResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_auto_backup_blocking(app))
        .await
        .map_err(|error| format!("Auto backup task failed: {error}"))?
}

fn run_auto_backup_blocking(app: tauri::AppHandle) -> Result<AutoBackupRunResult, String> {
    let backup_snapshot = database::save_auto_backup_snapshot(&app)?;
    let policy = database::get_cloud_backup_policy(&app)?;
    let initial_sync_status = database::get_auto_backup_sync_status(&app)?;
    let cloud_required = policy.auto_backup_enabled;
    let mut cloud_uploaded = false;
    let mut cloud_error = None;

    if cloud_required && !initial_sync_status.cloud_up_to_date {
        let cloud_status = cloud_backup::get_cloud_backup_status();

        if cloud_status.can_upload {
            match cloud_backup::upload_google_drive_backup_snapshot(
                &backup_snapshot.backup_path,
                &backup_snapshot.file_name,
                &backup_snapshot.bytes,
            ) {
                Ok(upload_result) => {
                    database::mark_cloud_auto_backup_synced(
                        &app,
                        &backup_snapshot.content_hash,
                        upload_result.remote_modified_time.as_deref(),
                    )?;
                    record_cloud_backup_audit(
                        &app,
                        database::RecordCloudBackupSnapshotInput {
                            provider: "google_drive".to_string(),
                            remote_file_id: upload_result.remote_file_id.clone(),
                            file_name: upload_result.remote_file_name.clone(),
                            remote_md5_checksum: upload_result.remote_md5_checksum.clone(),
                            remote_modified_time: upload_result.remote_modified_time.clone(),
                            size_bytes: i64::try_from(upload_result.bytes_uploaded).ok(),
                            operation: "upload".to_string(),
                            status: "success".to_string(),
                            message: Some(format!(
                                "Autosave uploaded {}.",
                                upload_result.remote_file_name
                            )),
                        },
                    );
                    cloud_uploaded = true;
                }
                Err(error) => {
                    cloud_error = Some(error);
                }
            }
        } else {
            cloud_error = Some(if cloud_status.detail.trim().is_empty() {
                "Google Drive is not connected.".to_string()
            } else {
                cloud_status.detail
            });
        }
    }

    let sync_status = database::get_auto_backup_sync_status(&app)?;

    Ok(AutoBackupRunResult {
        content_hash: backup_snapshot.content_hash,
        local_changed: backup_snapshot.changed,
        local_backup_path: backup_snapshot.backup_path,
        local_exported_at: backup_snapshot.exported_at,
        warp_pulls: backup_snapshot.warp_pulls,
        cloud_required,
        cloud_uploaded,
        cloud_error,
        sync_status,
    })
}

#[tauri::command]
fn get_auto_backup_sync_status(
    app: tauri::AppHandle,
) -> Result<database::AutoBackupSyncStatus, String> {
    database::get_auto_backup_sync_status(&app)
}

#[tauri::command]
fn list_google_drive_backup_snapshots(
) -> Result<Vec<cloud_backup::CloudBackupSnapshotSummary>, String> {
    cloud_backup::list_google_drive_backup_snapshots()
}

#[tauri::command]
fn restore_google_drive_backup_snapshot(
    app: tauri::AppHandle,
    input: cloud_backup::RestoreCloudBackupSnapshotInput,
) -> Result<database::RestoreBackupSnapshotResult, String> {
    let backup_snapshot =
        cloud_backup::download_google_drive_backup_snapshot(&input.remote_file_id)?;
    let file_name = input
        .file_name
        .clone()
        .unwrap_or_else(|| backup_snapshot.remote_file_id.clone());
    let backup_source = format!(
        "google-drive://{}/{}",
        backup_snapshot.remote_file_id, file_name
    );

    let restore_result =
        database::restore_backup_snapshot_from_bytes(&app, &backup_source, &backup_snapshot.bytes)?;

    record_cloud_backup_audit(
        &app,
        database::RecordCloudBackupSnapshotInput {
            provider: "google_drive".to_string(),
            remote_file_id: backup_snapshot.remote_file_id,
            file_name,
            remote_md5_checksum: input.remote_md5_checksum,
            remote_modified_time: input.remote_modified_time,
            size_bytes: parse_cloud_backup_size_bytes(input.size.as_deref()),
            operation: "restore".to_string(),
            status: "success".to_string(),
            message: Some(format!(
                "Restored {} pulls, inserted {} new pulls.",
                restore_result.warp_pulls, restore_result.warp_pulls_inserted
            )),
        },
    );

    Ok(restore_result)
}

#[tauri::command]
fn get_cloud_backup_policy(app: tauri::AppHandle) -> Result<database::CloudBackupPolicy, String> {
    database::get_cloud_backup_policy(&app)
}

#[tauri::command]
fn get_trash_retention_policy(
    app: tauri::AppHandle,
) -> Result<database::TrashRetentionPolicy, String> {
    database::get_trash_retention_policy(&app)
}

#[tauri::command]
fn update_trash_retention_policy(
    app: tauri::AppHandle,
    input: database::UpdateTrashRetentionPolicyInput,
) -> Result<database::TrashRetentionPolicy, String> {
    database::update_trash_retention_policy(&app, input)
}

#[tauri::command]
fn scan_game_history_source(
    input: game_history::ScanGameHistorySourceInput,
) -> game_history::GameHistorySourceScanResult {
    game_history::scan_game_history_source(input.game_path.as_deref())
}

#[tauri::command]
async fn find_game_install_paths(
    input: game_history::FindGameInstallPathsInput,
) -> Result<game_history::FindGameInstallPathsResult, String> {
    tauri::async_runtime::spawn_blocking(move || game_history::find_game_install_paths(input))
        .await
        .map_err(|error| format!("Game folder scan task failed: {error}"))
}

#[tauri::command]
fn validate_game_install_path(
    input: game_history::ValidateGameInstallPathInput,
) -> game_history::ValidateGameInstallPathResult {
    game_history::validate_game_install_path(input)
}

#[tauri::command]
async fn import_game_history(
    app: tauri::AppHandle,
    input: game_history::ImportGameHistoryInput,
) -> Result<game_history::ImportGameHistoryResult, String> {
    tauri::async_runtime::spawn_blocking(move || import_game_history_blocking(app, input))
        .await
        .map_err(|error| format!("Game history import task failed: {error}"))?
}

fn import_game_history_blocking(
    app: tauri::AppHandle,
    input: game_history::ImportGameHistoryInput,
) -> Result<game_history::ImportGameHistoryResult, String> {
    let max_pages_per_banner = game_history::max_pages_per_banner(input.max_pages_per_banner);
    let source_account_id = input.account.id.clone();
    let fetched_history = game_history::fetch_game_history_from_cache(
        input.game_path.as_deref(),
        Some(max_pages_per_banner),
    )?;
    let game_history::FetchedGameHistory {
        cache_path,
        endpoint_host,
        pages_fetched,
        records_found,
        detected_uid,
        pulls,
        ..
    } = fetched_history;
    let mut account = database::ManualImportAccountInput {
        id: input.account.id,
        uid: input.account.uid,
        region: input.account.region,
        nickname: input.account.nickname,
    };

    if let Some(uid) = detected_uid.as_ref().filter(|uid| !uid.trim().is_empty()) {
        account.id = format!("account-{uid}");
        account.uid = uid.clone();
    }

    let account_id = account.id.clone();
    let uid = account.uid.clone();
    let save_result = database::save_game_history_import(
        &app,
        database::SaveGameHistoryImportInput {
            account,
            merge_from_account_id: Some(source_account_id)
                .filter(|source_id| source_id != &account_id),
            records_found,
            source_cache_path: Some(cache_path.clone()),
            source_endpoint_host: endpoint_host.clone(),
            pulls: pulls
                .into_iter()
                .map(|pull| database::SaveGameHistoryPullInput {
                    banner_type: pull.banner_type,
                    item_source_id: pull.item_source_id,
                    gacha_id: pull.gacha_id,
                    pulled_at: pull.pulled_at,
                    pulled_at_timezone: pull.pulled_at_timezone,
                    sequence_in_timestamp_group: pull.sequence_in_timestamp_group,
                    raw_item_name: pull.raw_item_name,
                })
                .collect(),
        },
    )?;

    Ok(game_history::ImportGameHistoryResult {
        account_id,
        uid,
        import_batch_id: save_result.import_batch_id,
        records_found: save_result.records_found,
        records_inserted: save_result.records_inserted,
        records_restored: save_result.records_restored,
        records_skipped: save_result.records_skipped,
        duplicate_records: save_result.duplicate_records,
        banner_count: save_result.banner_count,
        manual_records_merged: save_result.manual_records_merged,
        manual_records_matched: save_result.manual_records_matched,
        pages_fetched,
        source_cache_path: cache_path,
        endpoint_host,
        detected_uid,
    })
}

#[tauri::command]
fn update_cloud_backup_policy(
    app: tauri::AppHandle,
    input: database::UpdateCloudBackupPolicyInput,
) -> Result<database::CloudBackupPolicy, String> {
    database::update_cloud_backup_policy(&app, input)
}

fn record_cloud_backup_audit(
    app: &tauri::AppHandle,
    input: database::RecordCloudBackupSnapshotInput,
) {
    match database::record_cloud_backup_snapshot(app, input) {
        Ok(result) => log::info!(
            "Recorded cloud backup audit event {} for {} ({} total events).",
            result.event_id,
            result.snapshot_id,
            result.total_events
        ),
        Err(error) => log::warn!("Failed to record cloud backup audit: {error}"),
    }
}

fn parse_cloud_backup_size_bytes(size: Option<&str>) -> Option<i64> {
    size.and_then(|value| value.parse::<i64>().ok())
        .filter(|size_bytes| *size_bytes >= 0)
}

#[tauri::command]
fn get_database_status(app: tauri::AppHandle) -> Result<database::DatabaseStatus, String> {
    database::get_database_status(&app)
}

#[tauri::command]
async fn sync_warp_item_catalog(
    app: tauri::AppHandle,
    items: Vec<database::WarpItemCatalogInput>,
) -> Result<database::SyncWarpItemCatalogResult, String> {
    tauri::async_runtime::spawn_blocking(move || database::sync_warp_item_catalog(&app, items))
        .await
        .map_err(|error| format!("Catalog sync task failed: {error}"))?
}

#[tauri::command]
fn save_manual_import_draft(
    app: tauri::AppHandle,
    draft: database::SaveManualImportDraftInput,
) -> Result<database::SaveManualImportDraftResult, String> {
    database::save_manual_import_draft(&app, draft)
}

#[tauri::command]
fn list_warp_pulls(
    app: tauri::AppHandle,
    query: database::ListWarpPullsInput,
) -> Result<database::ListWarpPullsResult, String> {
    database::list_warp_pulls(&app, query)
}

#[tauri::command]
fn list_accounts(app: tauri::AppHandle) -> Result<Vec<database::AccountRow>, String> {
    database::list_accounts(&app)
}

#[tauri::command]
fn update_account_avatar(
    app: tauri::AppHandle,
    input: database::UpdateAccountAvatarInput,
) -> Result<database::UpdateAccountAvatarResult, String> {
    database::update_account_avatar(&app, input)
}

#[tauri::command]
fn list_warp_banner_summaries(
    app: tauri::AppHandle,
    query: database::ListWarpBannerSummariesInput,
) -> Result<Vec<database::WarpBannerSummaryRow>, String> {
    database::list_warp_banner_summaries(&app, query)
}

#[tauri::command]
fn delete_warp_pull(
    app: tauri::AppHandle,
    input: database::DeleteWarpPullInput,
) -> Result<database::DeleteWarpPullResult, String> {
    database::delete_warp_pull(&app, input)
}

#[tauri::command]
fn delete_warp_pulls(
    app: tauri::AppHandle,
    input: database::DeleteWarpPullsInput,
) -> Result<database::DeleteWarpPullsResult, String> {
    database::delete_warp_pulls(&app, input)
}

#[tauri::command]
fn delete_account_warp_history(
    app: tauri::AppHandle,
    input: database::DeleteAccountWarpHistoryInput,
) -> Result<database::DeleteAccountWarpHistoryResult, String> {
    database::delete_account_warp_history(&app, input)
}

#[tauri::command]
fn delete_account(
    app: tauri::AppHandle,
    input: database::DeleteAccountInput,
) -> Result<database::DeleteAccountResult, String> {
    database::delete_account(&app, input)
}

#[tauri::command]
fn list_trashed_warp_pulls(
    app: tauri::AppHandle,
    query: database::ListWarpPullsInput,
) -> Result<database::ListTrashedWarpPullsResult, String> {
    database::list_trashed_warp_pulls(&app, query)
}

#[tauri::command]
fn list_trashed_accounts(
    app: tauri::AppHandle,
) -> Result<Vec<database::TrashedAccountRow>, String> {
    database::list_trashed_accounts(&app)
}

#[tauri::command]
fn restore_trashed_warp_pull(
    app: tauri::AppHandle,
    input: database::TrashWarpPullInput,
) -> Result<database::TrashWarpPullMutationResult, String> {
    database::restore_trashed_warp_pull(&app, input)
}

#[tauri::command]
fn restore_trashed_account(
    app: tauri::AppHandle,
    input: database::TrashAccountInput,
) -> Result<database::TrashAccountMutationResult, String> {
    database::restore_trashed_account(&app, input)
}

#[tauri::command]
fn permanently_delete_trashed_warp_pull(
    app: tauri::AppHandle,
    input: database::TrashWarpPullInput,
) -> Result<database::TrashWarpPullMutationResult, String> {
    database::permanently_delete_trashed_warp_pull(&app, input)
}

#[tauri::command]
fn permanently_delete_trashed_account(
    app: tauri::AppHandle,
    input: database::TrashAccountInput,
) -> Result<database::TrashAccountMutationResult, String> {
    database::permanently_delete_trashed_account(&app, input)
}

#[tauri::command]
fn list_trashed_backup_snapshots(
    app: tauri::AppHandle,
) -> Result<Vec<database::TrashedBackupSnapshotSummary>, String> {
    database::list_trashed_backup_snapshots(&app)
}

#[tauri::command]
fn list_backup_snapshots(
    app: tauri::AppHandle,
) -> Result<Vec<database::BackupSnapshotSummary>, String> {
    database::list_backup_snapshots(&app)
}

#[tauri::command]
fn delete_backup_snapshot(
    app: tauri::AppHandle,
    input: database::DeleteBackupSnapshotInput,
) -> Result<database::DeleteBackupSnapshotResult, String> {
    database::delete_backup_snapshot(&app, input)
}

#[tauri::command]
fn restore_trashed_backup_snapshot(
    app: tauri::AppHandle,
    input: database::DeleteBackupSnapshotInput,
) -> Result<database::DeleteBackupSnapshotResult, String> {
    database::restore_trashed_backup_snapshot(&app, input)
}

#[tauri::command]
fn permanently_delete_trashed_backup_snapshot(
    app: tauri::AppHandle,
    input: database::DeleteBackupSnapshotInput,
) -> Result<database::DeleteBackupSnapshotResult, String> {
    database::permanently_delete_trashed_backup_snapshot(&app, input)
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportBackupSnapshotInput {
    output_directory: Option<String>,
    output_path: Option<String>,
}

#[tauri::command]
fn export_backup_snapshot(
    app: tauri::AppHandle,
    input: Option<ExportBackupSnapshotInput>,
) -> Result<database::ExportBackupSnapshotResult, String> {
    database::export_backup_snapshot(
        &app,
        input.as_ref().and_then(|i| i.output_path.as_deref()),
        input.as_ref().and_then(|i| i.output_directory.as_deref()),
    )
}

#[tauri::command]
fn restore_latest_backup_snapshot(
    app: tauri::AppHandle,
) -> Result<database::RestoreBackupSnapshotResult, String> {
    database::restore_latest_backup_snapshot(&app)
}

#[tauri::command]
fn restore_backup_snapshot(
    app: tauri::AppHandle,
    input: database::RestoreBackupSnapshotInput,
) -> Result<database::RestoreBackupSnapshotResult, String> {
    database::restore_backup_snapshot(&app, input)
}

#[tauri::command]
async fn import_character_roster(
    app: tauri::AppHandle,
    input: roster::ImportCharacterRosterInput,
) -> Result<Vec<roster::RosterCharacter>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let characters = roster::parse_roster_payload(&input.payload)?;
        let characters = roster::cache_roster_images(&app, &input.account_id, characters)?;
        let normalized = serde_json::to_string(&characters)
            .map_err(|error| format!("Failed to prepare character roster: {error}"))?;
        database::save_character_roster(&app, &input.account_id, &normalized, characters.len())?;
        Ok(characters)
    })
    .await
    .map_err(|error| format!("Character roster task failed: {error}"))?
}

#[tauri::command]
async fn get_character_roster(
    app: tauri::AppHandle,
    input: roster::GetCharacterRosterInput,
) -> Result<Vec<roster::RosterCharacter>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(payload) = database::get_character_roster_payload(&app, &input.account_id)? else {
            return Ok(Vec::new());
        };
        serde_json::from_str(&payload)
            .map_err(|error| format!("Failed to decode character roster: {error}"))
    })
    .await
    .map_err(|error| format!("Character roster task failed: {error}"))?
}

#[tauri::command]
fn replace_database_from_backup_file(
    app: tauri::AppHandle,
    input: database::RestoreBackupSnapshotFromFileInput,
) -> Result<database::RestoreBackupSnapshotResult, String> {
    database::replace_database_from_backup_file(&app, input)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cancel_google_drive_backup_connection,
            connect_google_drive_backup,
            delete_account,
            delete_account_warp_history,
            delete_backup_snapshot,
            delete_warp_pull,
            delete_warp_pulls,
            disconnect_google_drive_backup,
            export_backup_snapshot,
            get_auto_backup_sync_status,
            get_character_roster,
            get_cloud_backup_status,
            get_cloud_backup_policy,
            get_trash_retention_policy,
            get_database_status,
            import_character_roster,
            import_game_history,
            list_accounts,
            list_trashed_accounts,
            list_trashed_warp_pulls,
            list_warp_banner_summaries,
            list_trashed_backup_snapshots,
            list_google_drive_backup_snapshots,
            list_backup_snapshots,
            list_warp_pulls,
            permanently_delete_trashed_account,
            permanently_delete_trashed_warp_pull,
            replace_database_from_backup_file,
            restore_google_drive_backup_snapshot,
            restore_backup_snapshot,
            restore_trashed_account,
            restore_trashed_backup_snapshot,
            restore_latest_backup_snapshot,
            permanently_delete_trashed_backup_snapshot,
            restore_trashed_warp_pull,
            run_auto_backup,
            save_manual_import_draft,
            scan_game_history_source,
            find_game_install_paths,
            sync_warp_item_catalog,
            update_cloud_backup_policy,
            update_trash_retention_policy,
            update_account_avatar,
            validate_game_install_path,
            upload_latest_google_drive_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
