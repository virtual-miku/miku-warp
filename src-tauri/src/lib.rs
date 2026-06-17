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
fn scan_game_history_source() -> game_history::GameHistorySourceScanResult {
    game_history::scan_game_history_source()
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
fn sync_warp_item_catalog(
    app: tauri::AppHandle,
    items: Vec<database::WarpItemCatalogInput>,
) -> Result<database::SyncWarpItemCatalogResult, String> {
    database::sync_warp_item_catalog(&app, items)
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
) -> Result<Vec<database::WarpPullRow>, String> {
    database::list_warp_pulls(&app, query)
}

#[tauri::command]
fn list_warp_banner_summaries(
    app: tauri::AppHandle,
    query: database::ListWarpBannerSummariesInput,
) -> Result<Vec<database::WarpBannerSummaryRow>, String> {
    database::list_warp_banner_summaries(&app, query)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            delete_backup_snapshot,
            disconnect_google_drive_backup,
            export_backup_snapshot,
            get_cloud_backup_status,
            get_cloud_backup_policy,
            get_database_status,
            list_warp_banner_summaries,
            list_google_drive_backup_snapshots,
            list_backup_snapshots,
            list_warp_pulls,
            restore_google_drive_backup_snapshot,
            restore_backup_snapshot,
            restore_latest_backup_snapshot,
            save_manual_import_draft,
            scan_game_history_source,
            sync_warp_item_catalog,
            update_cloud_backup_policy,
            upload_latest_google_drive_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
