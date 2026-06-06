pub mod cloud_backup;
mod database;

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

    cloud_backup::upload_google_drive_backup_snapshot(
        &backup_snapshot.backup_path,
        &backup_snapshot.file_name,
        &backup_snapshot.bytes,
    )
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
    let backup_source = format!("google-drive://{}", backup_snapshot.remote_file_id);

    database::restore_backup_snapshot_from_bytes(&app, &backup_source, &backup_snapshot.bytes)
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
            get_database_status,
            list_google_drive_backup_snapshots,
            list_backup_snapshots,
            list_warp_pulls,
            restore_google_drive_backup_snapshot,
            restore_backup_snapshot,
            restore_latest_backup_snapshot,
            save_manual_import_draft,
            sync_warp_item_catalog,
            upload_latest_google_drive_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
