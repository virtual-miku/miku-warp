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
            get_database_status,
            sync_warp_item_catalog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
