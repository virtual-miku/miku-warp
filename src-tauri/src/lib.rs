pub mod cloud_backup;
mod database;
mod game_history;

#[tauri::command]
fn get_cloud_backup_status() -> cloud_backup::CloudBackupStatus {
    cloud_backup::get_cloud_backup_status()
}

#[tauri::command]
fn connect_google_drive_backup() -> Result<cloud_backup::CloudBackupStatus, String> {
    cloud_backup::connect_google_drive_backup()
}

#[tauri::command]
fn disconnect_google_drive_backup() -> Result<cloud_backup::CloudBackupStatus, String> {
    cloud_backup::disconnect_google_drive_backup()
}

#[tauri::command]
fn upload_latest_google_drive_backup(
    app: tauri::AppHandle,
) -> Result<cloud_backup::UploadCloudBackupSnapshotResult, String> {
    let backup_snapshot = database::read_latest_backup_snapshot_file(&app)?;

    let upload_result = cloud_backup::upload_google_drive_backup_snapshot(
        &backup_snapshot.backup_path,
        &backup_snapshot.file_name,
        &backup_snapshot.bytes,
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
                "Uploaded local snapshot {}.",
                upload_result.file_name
            )),
        },
    );

    Ok(upload_result)
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
fn scan_game_history_source(
    input: game_history::ScanGameHistorySourceInput,
) -> game_history::GameHistorySourceScanResult {
    game_history::scan_game_history_source(input.game_path.as_deref())
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
fn list_trashed_warp_pulls(
    app: tauri::AppHandle,
    query: database::ListWarpPullsInput,
) -> Result<database::ListTrashedWarpPullsResult, String> {
    database::list_trashed_warp_pulls(&app, query)
}

#[tauri::command]
fn restore_trashed_warp_pull(
    app: tauri::AppHandle,
    input: database::TrashWarpPullInput,
) -> Result<database::TrashWarpPullMutationResult, String> {
    database::restore_trashed_warp_pull(&app, input)
}

#[tauri::command]
fn permanently_delete_trashed_warp_pull(
    app: tauri::AppHandle,
    input: database::TrashWarpPullInput,
) -> Result<database::TrashWarpPullMutationResult, String> {
    database::permanently_delete_trashed_warp_pull(&app, input)
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
fn export_backup_snapshot(
    app: tauri::AppHandle,
) -> Result<database::ExportBackupSnapshotResult, String> {
    database::export_backup_snapshot(&app)
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
            connect_google_drive_backup,
            delete_account_warp_history,
            delete_backup_snapshot,
            delete_warp_pull,
            delete_warp_pulls,
            disconnect_google_drive_backup,
            export_backup_snapshot,
            get_cloud_backup_status,
            get_cloud_backup_policy,
            get_database_status,
            import_game_history,
            list_accounts,
            list_trashed_warp_pulls,
            list_warp_banner_summaries,
            list_google_drive_backup_snapshots,
            list_backup_snapshots,
            list_warp_pulls,
            permanently_delete_trashed_warp_pull,
            replace_database_from_backup_file,
            restore_google_drive_backup_snapshot,
            restore_backup_snapshot,
            restore_latest_backup_snapshot,
            restore_trashed_warp_pull,
            save_manual_import_draft,
            scan_game_history_source,
            sync_warp_item_catalog,
            update_cloud_backup_policy,
            upload_latest_google_drive_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
