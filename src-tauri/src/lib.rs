pub mod commands;
pub mod fast_scanner;
pub mod models;
pub mod treemap;
pub mod windows_drives;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_drives,
            start_scan,
            cancel_scan,
            get_node_children,
            get_treemap_data,
            get_extension_stats,
            get_files_by_filter,
            open_in_explorer,
            open_file,
            show_file_properties,
            paste_file,
            delete_to_trash,
            window_minimize,
            window_maximize,
            window_close,
            quick_clean_scan,
            quick_clean_purge,
            deep_clean_scan,
            deep_clean_purge,
            dev_clean_scan,
            dev_clean_purge,
            duplicate_scan,
            duplicate_purge,
            list_category_children,
            purge_specific_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DiskLens application");
}
