mod database;

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
            delete_backup_snapshot,
            export_backup_snapshot,
            get_database_status,
            list_backup_snapshots,
            list_warp_pulls,
            restore_backup_snapshot,
            restore_latest_backup_snapshot,
            save_manual_import_draft,
            sync_warp_item_catalog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
