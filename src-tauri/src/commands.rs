use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use rayon::prelude::*;
use tauri::{AppHandle, State};

#[cfg(windows)]
use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
#[cfg(windows)]
use windows_sys::Win32::Storage::FileSystem::{
    FindClose, FindFirstFileExW, FindNextFileW, FindExInfoBasic,
    FindExSearchNameMatch, FIND_FIRST_EX_LARGE_FETCH,
    FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT, WIN32_FIND_DATAW,
};

use crate::fast_scanner::{get_category_and_color, perform_scan, ScanState};
use crate::models::{CleanCategoryItem, DriveInfo, ExtensionStat, FileNode, FileNodeDto, QuickCleanResult, ScanSummary, TreemapRect};
use crate::treemap::generate_treemap;
use crate::windows_drives::list_drives;

pub type CategoryCache = Arc<RwLock<std::collections::HashMap<String, (Vec<u64>, Vec<u32>)>>>;

pub struct AppState {
    pub scan_state: Arc<RwLock<ScanState>>,
    pub cancel_flag: Arc<AtomicBool>,
    pub is_scanning: Arc<AtomicBool>,
    pub category_tree_cache: CategoryCache,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            scan_state: Arc::new(RwLock::new(ScanState::default())),
            cancel_flag: Arc::new(AtomicBool::new(false)),
            is_scanning: Arc::new(AtomicBool::new(false)),
            category_tree_cache: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
pub fn get_drives() -> Vec<DriveInfo> {
    list_drives()
}

#[tauri::command]
pub async fn start_scan(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<ScanSummary, String> {
    if state.is_scanning.swap(true, Ordering::SeqCst) {
        return Err("A scan is already in progress".to_string());
    }

    state.cancel_flag.store(false, Ordering::SeqCst);
    let cancel_flag = Arc::clone(&state.cancel_flag);
    let is_scanning = Arc::clone(&state.is_scanning);
    let scan_state_lock = Arc::clone(&state.scan_state);

    let res = tauri::async_runtime::spawn_blocking(move || {
        let outcome = perform_scan(&app, path, cancel_flag);
        is_scanning.store(false, Ordering::SeqCst);

        match outcome {
            Ok(new_scan_state) => {
                let summary = ScanSummary {
                    root_id: new_scan_state.root_id,
                    total_files: new_scan_state.total_files,
                    total_dirs: new_scan_state.total_dirs,
                    total_bytes: new_scan_state.total_bytes,
                    elapsed_ms: new_scan_state.elapsed_ms,
                    root_path: new_scan_state.root_path.clone(),
                };

                if let Ok(mut write_guard) = scan_state_lock.write() {
                    *write_guard = new_scan_state;
                }

                Ok(summary)
            }
            Err(e) => Err(e),
        }
    })
    .await;

    if let Ok(mut cache) = state.category_tree_cache.write() {
        cache.clear();
    }

    match res {
        Ok(inner_res) => inner_res,
        Err(e) => {
            state.is_scanning.store(false, Ordering::SeqCst);
            Err(format!("Task execution failed: {}", e))
        }
    }
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, AppState>) -> Result<(), String> {
    state.cancel_flag.store(true, Ordering::SeqCst);
    Ok(())
}

fn matches_category(extension: Option<&str>, cat_filter: &str) -> bool {
    let ext = extension.unwrap_or("");
    let (cat, _) = get_category_and_color(ext);
    let cat_lower = cat.to_lowercase();
    let filter_lower = cat_filter.to_lowercase();

    match filter_lower.as_str() {
        "all" => true,
        "image" | "images" => cat_lower == "image",
        "video" | "videos" => cat_lower == "video",
        "document" | "documents" => cat_lower == "document",
        "zip" | "archive" | "archives" => cat_lower == "archive",
        "other" | "others" => {
            cat_lower != "image"
                && cat_lower != "video"
                && cat_lower != "document"
                && cat_lower != "archive"
        }
        _ => cat_lower == filter_lower,
    }
}

pub fn compute_filtered_tree_stats(
    nodes: &[FileNode],
    category_filter: &str,
) -> (Vec<u64>, Vec<u32>) {
    let n = nodes.len();
    let mut filtered_sizes = vec![0u64; n];
    let mut filtered_counts = vec![0u32; n];

    // 1. Direct match for leaf files
    for i in 0..n {
        if !nodes[i].is_dir && matches_category(nodes[i].extension.as_deref(), category_filter) {
            filtered_sizes[i] = nodes[i].size;
            filtered_counts[i] = 1;
        }
    }

    // 2. Direct files contribution to directories
    for i in 0..n {
        if nodes[i].is_dir {
            let mut d_size = 0u64;
            let mut d_count = 0u32;
            for &child_id in &nodes[i].children {
                if child_id < n && !nodes[child_id].is_dir {
                    d_size += filtered_sizes[child_id];
                    d_count += filtered_counts[child_id];
                }
            }
            filtered_sizes[i] = d_size;
            filtered_counts[i] = d_count;
        }
    }

    // 3. Rollup directories bottom-up in reverse order
    for d in (1..n).rev() {
        if nodes[d].is_dir {
            let d_size = filtered_sizes[d];
            let d_count = filtered_counts[d];
            if d_count > 0 {
                if let Some(parent_id) = nodes[d].parent_id {
                    if parent_id < n && nodes[parent_id].is_dir {
                        filtered_sizes[parent_id] += d_size;
                        filtered_counts[parent_id] += d_count;
                    }
                }
            }
        }
    }

    (filtered_sizes, filtered_counts)
}

#[tauri::command]
pub fn get_node_children(
    state: State<'_, AppState>,
    parent_id: Option<usize>,
    category: Option<String>,
) -> Result<Vec<FileNodeDto>, String> {
    let guard = state.scan_state.read().map_err(|e| e.to_string())?;
    if guard.nodes.is_empty() {
        return Ok(Vec::new());
    }

    let target_id = parent_id.unwrap_or(guard.root_id);
    if target_id >= guard.nodes.len() {
        return Err("Node index out of bounds".to_string());
    }

    let parent_node = &guard.nodes[target_id];

    // Check if filtering by category
    let is_filtered = category
        .as_ref()
        .map(|c| !c.eq_ignore_ascii_case("all") && !c.is_empty())
        .unwrap_or(false);

    if !is_filtered {
        let parent_size = parent_node.size.max(1);
        let mut dtos = Vec::with_capacity(parent_node.children.len());
        for &child_id in &parent_node.children {
            if child_id < guard.nodes.len() {
                let child = &guard.nodes[child_id];
                let percentage = (child.size as f64 / parent_size as f64) * 100.0;
                dtos.push(FileNodeDto {
                    id: child.id,
                    parent_id: child.parent_id,
                    name: child.name.clone(),
                    path: child.path.clone(),
                    size: child.size,
                    is_dir: child.is_dir,
                    file_count: child.file_count,
                    dir_count: child.dir_count,
                    has_children: child.is_dir && !child.children.is_empty(),
                    extension: child.extension.clone(),
                    percentage_of_parent: percentage,
                    modified: child.modified,
                });
            }
        }
        return Ok(dtos);
    }

    // Filtered tree by category
    let cat_key = category.as_ref().unwrap().to_lowercase();

    let (filtered_sizes, filtered_counts) = {
        let read_cache = state.category_tree_cache.read().map_err(|e| e.to_string())?;
        if let Some(cached) = read_cache.get(&cat_key) {
            cached.clone()
        } else {
            drop(read_cache);
            let computed = compute_filtered_tree_stats(&guard.nodes, &cat_key);
            if let Ok(mut write_cache) = state.category_tree_cache.write() {
                write_cache.insert(cat_key, computed.clone());
            }
            computed
        }
    };

    let parent_size = filtered_sizes[target_id].max(1);
    let mut dtos = Vec::new();

    for &child_id in &parent_node.children {
        if child_id < guard.nodes.len() {
            let child = &guard.nodes[child_id];
            if child.is_dir {
                // Only include directories that have matching files in their subtree!
                let count = filtered_counts[child_id];
                if count > 0 {
                    let size = filtered_sizes[child_id];
                    let percentage = (size as f64 / parent_size as f64) * 100.0;
                    dtos.push(FileNodeDto {
                        id: child.id,
                        parent_id: child.parent_id,
                        name: child.name.clone(),
                        path: child.path.clone(),
                        size,
                        is_dir: true,
                        file_count: count,
                        dir_count: child.dir_count,
                        has_children: count > 0,
                        extension: None,
                        percentage_of_parent: percentage,
                        modified: child.modified,
                    });
                }
            } else {
                // Direct file: only include if it matches the category
                if filtered_counts[child_id] > 0 {
                    let percentage = (child.size as f64 / parent_size as f64) * 100.0;
                    dtos.push(FileNodeDto {
                        id: child.id,
                        parent_id: child.parent_id,
                        name: child.name.clone(),
                        path: child.path.clone(),
                        size: child.size,
                        is_dir: false,
                        file_count: 0,
                        dir_count: 0,
                        has_children: false,
                        extension: child.extension.clone(),
                        percentage_of_parent: percentage,
                        modified: child.modified,
                    });
                }
            }
        }
    }

    dtos.sort_unstable_by_key(|a| std::cmp::Reverse(a.size));
    Ok(dtos)
}

#[tauri::command]
pub fn get_treemap_data(
    state: State<'_, AppState>,
    root_id: Option<usize>,
    width: f64,
    height: f64,
    max_depth: usize,
) -> Result<Vec<TreemapRect>, String> {
    let guard = state.scan_state.read().map_err(|e| e.to_string())?;
    if guard.nodes.is_empty() {
        return Ok(Vec::new());
    }

    let target_id = root_id.unwrap_or(guard.root_id);
    let rects = generate_treemap(&guard.nodes, target_id, width, height, max_depth.max(1));
    Ok(rects)
}

#[tauri::command]
pub fn get_extension_stats(state: State<'_, AppState>) -> Result<Vec<ExtensionStat>, String> {
    let guard = state.scan_state.read().map_err(|e| e.to_string())?;
    Ok(guard.extension_stats.clone())
}

#[tauri::command]
pub fn get_files_by_filter(
    state: State<'_, AppState>,
    extension: Option<String>,
    category: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<FileNodeDto>, String> {
    let guard = state.scan_state.read().map_err(|e| e.to_string())?;
    if guard.nodes.is_empty() {
        return Ok(Vec::new());
    }

    let ext_target = extension
        .as_deref()
        .map(|e| e.trim_start_matches('.').to_lowercase())
        .filter(|e| !e.is_empty() && e != "all");
    let cat_target = category
        .as_deref()
        .map(|c| c.to_lowercase())
        .filter(|c| c != "all");

    let mut matches: Vec<&FileNode> = guard
        .nodes
        .iter()
        .filter(|node| {
            if node.is_dir {
                return false;
            }
            if let Some(ref ext) = ext_target {
                let node_ext = node.extension.as_deref().unwrap_or("").to_lowercase();
                if &node_ext != ext {
                    return false;
                }
            }
            if let Some(ref cat) = cat_target {
                let node_ext = node.extension.as_deref().unwrap_or("");
                let (node_cat, _) = get_category_and_color(node_ext);
                let cat_lower = node_cat.to_lowercase();
                if cat == "other" || cat == "others" {
                    if cat_lower == "image" || cat_lower == "video" || cat_lower == "archive" || cat_lower == "document" {
                        return false;
                    }
                } else if cat == "zip" || cat == "archive" || cat == "archives" {
                    if cat_lower != "archive" {
                        return false;
                    }
                } else if cat_lower != *cat && format!("{}s", cat_lower) != *cat {
                    return false;
                }
            }
            true
        })
        .collect();

    // Sort by size descending (largest files first)
    matches.sort_unstable_by_key(|a| std::cmp::Reverse(a.size));

    let max_count = limit.unwrap_or(2000).min(matches.len());
    let total_scanned_size = guard.total_bytes.max(1) as f64;

    let dtos: Vec<FileNodeDto> = matches[..max_count]
        .iter()
        .map(|node| {
            let pct = (node.size as f64 / total_scanned_size) * 100.0;
            FileNodeDto {
                id: node.id,
                parent_id: node.parent_id,
                name: node.name.clone(),
                path: node.path.clone(),
                size: node.size,
                is_dir: false,
                file_count: 0,
                dir_count: 0,
                has_children: false,
                extension: node.extension.clone(),
                percentage_of_parent: pct,
                modified: node.modified,
            }
        })
        .collect();

    Ok(dtos)
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        // If file, select it in explorer (/select,path)
        let p = std::path::Path::new(&path);
        if p.is_file() {
            Command::new("explorer")
                .args(["/select,", &path])
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Ok(())
    }
}

#[tauri::command]
pub fn delete_to_trash(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::Shell::{
            SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_SILENT, FO_DELETE,
            SHFILEOPSTRUCTW,
        };

        let mut wide_path: Vec<u16> = std::ffi::OsStr::new(&path).encode_wide().collect();
        // SHFileOperation requires double null termination
        wide_path.push(0);
        wide_path.push(0);

        let mut file_op = SHFILEOPSTRUCTW {
            hwnd: std::ptr::null_mut(),
            wFunc: FO_DELETE,
            pFrom: wide_path.as_ptr(),
            pTo: std::ptr::null(),
            fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT) as u16,
            fAnyOperationsAborted: 0,
            hNameMappings: std::ptr::null_mut(),
            lpszProgressTitle: std::ptr::null(),
        };

        let result = unsafe { SHFileOperationW(&mut file_op) };
        if result == 0 {
            Ok(())
        } else {
            Err(format!("Failed to recycle file: error code {}", result))
        }
    }
    #[cfg(not(windows))]
    {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        let p = std::path::Path::new(&path);
        if p.is_dir() {
            Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("cmd")
                .args(["/C", "start", "", &path])
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Ok(())
    }
}

#[tauri::command]
pub fn show_file_properties(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        let script = format!(
            "$item = Get-Item -LiteralPath '{}' -ErrorAction SilentlyContinue; if ($item) {{ $shell = New-Object -ComObject Shell.Application; $folder = $shell.NameSpace($item.DirectoryName); if ($folder) {{ $file = $folder.ParseName($item.Name); if ($file) {{ $file.InvokeVerb('Properties') }} }} }}",
            path.replace("'", "''")
        );
        Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Ok(())
    }
}

#[tauri::command]
pub fn paste_file(source: String, destination_folder: String, is_cut: bool) -> Result<(), String> {
    let src = std::path::Path::new(&source);
    let dest_dir = std::path::Path::new(&destination_folder);
    if !src.exists() {
        return Err("Source file does not exist".to_string());
    }
    let target_dir = if dest_dir.is_dir() {
        dest_dir.to_path_buf()
    } else {
        dest_dir.parent().unwrap_or(dest_dir).to_path_buf()
    };

    let filename = src.file_name().ok_or("Invalid filename")?;
    let target_path = target_dir.join(filename);

    if is_cut {
        std::fs::rename(src, &target_path).map_err(|e| e.to_string())?;
    } else {
        if src.is_file() {
            std::fs::copy(src, &target_path).map_err(|e| e.to_string())?;
        } else {
            return Err("Folder copy is not supported directly".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn window_minimize(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn window_maximize(window: tauri::Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
pub fn window_close(window: tauri::Window) {
    let _ = window.close();
}

#[cfg(windows)]
fn fast_win32_scan_dir(dir_path: &str, max_depth: usize, current_depth: usize) -> (u64, usize) {
    if current_depth > max_depth {
        return (0, 0);
    }

    let mut search_pattern = String::with_capacity(dir_path.len() + 3);
    search_pattern.push_str(dir_path);
    if !dir_path.ends_with('\\') && !dir_path.ends_with('/') {
        search_pattern.push('\\');
    }
    search_pattern.push('*');

    let mut wide: Vec<u16> = search_pattern.encode_utf16().collect();
    wide.push(0);

    let mut find_data: WIN32_FIND_DATAW = unsafe { std::mem::zeroed() };

    let handle = unsafe {
        FindFirstFileExW(
            wide.as_ptr(),
            FindExInfoBasic,
            &mut find_data as *mut _ as *mut _,
            FindExSearchNameMatch,
            std::ptr::null(),
            FIND_FIRST_EX_LARGE_FETCH,
        )
    };

    if handle == INVALID_HANDLE_VALUE {
        return (0, 0);
    }

    let mut total_size = 0u64;
    let mut total_files = 0usize;
    let mut subdirs = Vec::new();

    loop {
        let name_len = find_data.cFileName.iter().position(|&c| c == 0).unwrap_or(find_data.cFileName.len());
        let is_dot = name_len == 1 && find_data.cFileName[0] == b'.' as u16;
        let is_dotdot = name_len == 2 && find_data.cFileName[0] == b'.' as u16 && find_data.cFileName[1] == b'.' as u16;

        if !is_dot && !is_dotdot && name_len > 0 {
            let attrs = find_data.dwFileAttributes;
            let is_dir = (attrs & FILE_ATTRIBUTE_DIRECTORY) != 0;
            let is_reparse = (attrs & FILE_ATTRIBUTE_REPARSE_POINT) != 0;

            if is_dir {
                if !is_reparse && current_depth < max_depth {
                    if let Ok(name) = String::from_utf16(&find_data.cFileName[..name_len]) {
                        let mut sub_path = String::with_capacity(dir_path.len() + 1 + name.len());
                        sub_path.push_str(dir_path);
                        if !dir_path.ends_with('\\') && !dir_path.ends_with('/') {
                            sub_path.push('\\');
                        }
                        sub_path.push_str(&name);
                        subdirs.push(sub_path);
                    }
                }
            } else {
                let size = ((find_data.nFileSizeHigh as u64) << 32) | (find_data.nFileSizeLow as u64);
                total_size += size;
                total_files += 1;
            }
        }

        if unsafe { FindNextFileW(handle, &mut find_data) } == 0 {
            break;
        }
    }

    unsafe {
        FindClose(handle);
    }

    for sub in subdirs {
        let (s, f) = fast_win32_scan_dir(&sub, max_depth, current_depth + 1);
        total_size += s;
        total_files += f;
    }

    (total_size, total_files)
}

#[cfg(not(windows))]
fn fast_win32_scan_dir(dir_path: &str, max_depth: usize, current_depth: usize) -> (u64, usize) {
    if current_depth > max_depth {
        return (0, 0);
    }
    let p = std::path::Path::new(dir_path);
    if !p.exists() {
        return (0, 0);
    }
    let mut total_size = 0u64;
    let mut total_files = 0usize;
    if let Ok(entries) = std::fs::read_dir(p) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total_size += meta.len();
                    total_files += 1;
                } else if meta.is_dir() {
                    let (s, f) = fast_win32_scan_dir(&entry.path().to_string_lossy(), max_depth, current_depth + 1);
                    total_size += s;
                    total_files += f;
                }
            }
        }
    }
    (total_size, total_files)
}

fn purge_dir_contents(path: &std::path::Path) -> (u64, usize) {
    if !path.exists() {
        return (0, 0);
    }
    let mut freed_bytes = 0u64;
    let mut removed_files = 0usize;

    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    let len = meta.len();
                    if std::fs::remove_file(&p).is_ok() {
                        freed_bytes += len;
                        removed_files += 1;
                    }
                } else if meta.is_dir() {
                    let (sub_freed, sub_count) = purge_dir_contents(&p);
                    freed_bytes += sub_freed;
                    removed_files += sub_count;
                    let _ = std::fs::remove_dir(&p);
                }
            }
        }
    }
    (freed_bytes, removed_files)
}

struct CategorySpec {
    id: String,
    name: String,
    description: String,
    paths: Vec<std::path::PathBuf>,
    max_depth: usize,
    is_selected: bool,
    is_safe: bool,
}

impl CategorySpec {
    fn new(
        id: &str,
        name: impl Into<String>,
        description: impl Into<String>,
        paths: Vec<std::path::PathBuf>,
        max_depth: usize,
        is_selected: bool,
        is_safe: bool,
    ) -> Self {
        Self {
            id: id.to_string(),
            name: name.into(),
            description: description.into(),
            paths,
            max_depth,
            is_selected,
            is_safe,
        }
    }
}

#[tauri::command]
pub async fn quick_clean_scan(drive: String) -> Result<QuickCleanResult, String> {
    let start_time = std::time::Instant::now();
    let drive_letter = drive.chars().next().unwrap_or('C').to_ascii_uppercase();

    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".to_string());
    let program_data = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());

    let specs: Vec<CategorySpec> = if drive_letter == 'C' {
        vec![
            CategorySpec::new(
                "user_temp",
                "User Temporary Files",
                "Temporary application caches, installer scraps and session files",
                vec![std::path::PathBuf::from(&local_appdata).join("Temp")],
                4,
                true,
                true,
            ),
            CategorySpec::new(
                "system_temp",
                "Windows System Temp",
                "Temporary files created by Windows system services",
                vec![std::path::PathBuf::from(&windir).join("Temp")],
                4,
                true,
                true,
            ),
            CategorySpec::new(
                "update_cache",
                "Windows Update Cache",
                "Downloaded patch packages already installed on your system",
                vec![std::path::PathBuf::from(&windir).join("SoftwareDistribution").join("Download")],
                4,
                true,
                true,
            ),
            CategorySpec::new(
                "crash_dumps",
                "Crash Dumps & Error Logs",
                "Memory dumps generated when programs crash",
                vec![
                    std::path::PathBuf::from(&local_appdata).join("CrashDumps"),
                    std::path::PathBuf::from(&windir).join("Minidump"),
                ],
                3,
                true,
                true,
            ),
            CategorySpec::new(
                "wer_reports",
                "Windows Error Reporting",
                "Archived telemetry reports generated during system faults",
                vec![
                    std::path::PathBuf::from(&program_data).join("Microsoft").join("Windows").join("WER").join("ReportArchive"),
                    std::path::PathBuf::from(&program_data).join("Microsoft").join("Windows").join("WER").join("ReportQueue"),
                ],
                3,
                true,
                true,
            ),
            CategorySpec::new(
                "system_logs",
                "System Log Files",
                "Historical service and diagnostic log files",
                vec![
                    std::path::PathBuf::from(&windir).join("System32").join("LogFiles"),
                    std::path::PathBuf::from(&windir).join("Logs"),
                ],
                3,
                true,
                true,
            ),
            CategorySpec::new(
                "browser_cache",
                "Web Browser Caches",
                "Temporary web images and page caches from Chrome & Edge",
                vec![
                    std::path::PathBuf::from(&local_appdata).join("Google").join("Chrome").join("User Data").join("Default").join("Cache"),
                    std::path::PathBuf::from(&local_appdata).join("Microsoft").join("Edge").join("User Data").join("Default").join("Cache"),
                ],
                3,
                true,
                true,
            ),
            CategorySpec::new(
                "recycle_bin",
                "Recycle Bin (C:)",
                "Files currently sitting in the Windows Recycle Bin",
                vec![std::path::PathBuf::from("C:\\$Recycle.Bin")],
                4,
                false,
                true,
            ),
        ]
    } else {
        let root = format!("{}:\\", drive_letter);
        vec![
            CategorySpec::new(
                "recycle_bin",
                format!("Recycle Bin ({}:)", drive_letter),
                "Files currently stored in the Recycle Bin on this drive",
                vec![std::path::PathBuf::from(&root).join("$Recycle.Bin")],
                4,
                false,
                true,
            ),
            CategorySpec::new(
                "drive_temp",
                format!("Temporary Folder ({}:\\Temp)", drive_letter),
                "Temporary files stored on this drive",
                vec![std::path::PathBuf::from(&root).join("Temp")],
                3,
                true,
                true,
            ),
        ]
    };

    // Parallel multi-threaded category discovery via Rayon + Win32 kernel batching
    let categories: Vec<CleanCategoryItem> = specs
        .into_par_iter()
        .map(|spec| {
            let mut cat_size = 0u64;
            let mut cat_files = 0usize;

            for p in &spec.paths {
                if p.exists() {
                    let path_str = p.to_string_lossy();
                    let (sz, cnt) = fast_win32_scan_dir(&path_str, spec.max_depth, 0);
                    cat_size += sz;
                    cat_files += cnt;
                }
            }

            let display_path = spec
                .paths
                .first()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            CleanCategoryItem {
                id: spec.id.to_string(),
                name: spec.name.to_string(),
                description: spec.description.to_string(),
                path: display_path,
                size_bytes: cat_size,
                file_count: cat_files,
                is_selected: spec.is_selected,
                is_safe: spec.is_safe,
            }
        })
        .collect();

    let total_size_bytes = categories.iter().map(|c| c.size_bytes).sum();
    let total_files = categories.iter().map(|c| c.file_count).sum();
    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    Ok(QuickCleanResult {
        total_size_bytes,
        total_files,
        categories,
        elapsed_ms,
    })
}

#[tauri::command]
pub async fn quick_clean_purge(drive: String, category_ids: Vec<String>) -> Result<(u64, usize), String> {
    let drive_letter = drive.chars().next().unwrap_or('C').to_ascii_uppercase();
    let mut total_freed = 0u64;
    let mut total_removed = 0usize;

    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".to_string());
    let program_data = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());

    for cat_id in category_ids {
        match cat_id.as_str() {
            "user_temp" => {
                let p = std::path::PathBuf::from(&local_appdata).join("Temp");
                let (f, c) = purge_dir_contents(&p);
                total_freed += f;
                total_removed += c;
            }
            "system_temp" => {
                let p = std::path::PathBuf::from(&windir).join("Temp");
                let (f, c) = purge_dir_contents(&p);
                total_freed += f;
                total_removed += c;
            }
            "update_cache" => {
                let p = std::path::PathBuf::from(&windir).join("SoftwareDistribution").join("Download");
                let (f, c) = purge_dir_contents(&p);
                total_freed += f;
                total_removed += c;
            }
            "crash_dumps" => {
                let p1 = std::path::PathBuf::from(&local_appdata).join("CrashDumps");
                let p2 = std::path::PathBuf::from(&windir).join("Minidump");
                let (f1, c1) = purge_dir_contents(&p1);
                let (f2, c2) = purge_dir_contents(&p2);
                total_freed += f1 + f2;
                total_removed += c1 + c2;
            }
            "wer_reports" => {
                let p1 = std::path::PathBuf::from(&program_data).join("Microsoft").join("Windows").join("WER").join("ReportArchive");
                let p2 = std::path::PathBuf::from(&program_data).join("Microsoft").join("Windows").join("WER").join("ReportQueue");
                let (f1, c1) = purge_dir_contents(&p1);
                let (f2, c2) = purge_dir_contents(&p2);
                total_freed += f1 + f2;
                total_removed += c1 + c2;
            }
            "system_logs" => {
                let p = std::path::PathBuf::from(&windir).join("System32").join("LogFiles");
                let (f, c) = purge_dir_contents(&p);
                total_freed += f;
                total_removed += c;
            }
            "browser_cache" => {
                let p1 = std::path::PathBuf::from(&local_appdata).join("Google").join("Chrome").join("User Data").join("Default").join("Cache");
                let p2 = std::path::PathBuf::from(&local_appdata).join("Microsoft").join("Edge").join("User Data").join("Default").join("Cache");
                let (f1, c1) = purge_dir_contents(&p1);
                let (f2, c2) = purge_dir_contents(&p2);
                total_freed += f1 + f2;
                total_removed += c1 + c2;
            }
            "recycle_bin" => {
                let root = format!("{}:\\$Recycle.Bin", drive_letter);
                let p = std::path::PathBuf::from(&root);
                let (f, c) = purge_dir_contents(&p);
                total_freed += f;
                total_removed += c;
            }
            "drive_temp" => {
                let root = format!("{}:\\Temp", drive_letter);
                let p = std::path::PathBuf::from(&root);
                let (f, c) = purge_dir_contents(&p);
                total_freed += f;
                total_removed += c;
            }
            _ => {}
        }
    }

    Ok((total_freed, total_removed))
}


// ==========================================================================
// Deep Clean Engine (Reverse-engineered from Microsoft PC Manager)
// ==========================================================================

#[tauri::command]
pub async fn deep_clean_scan(drive: String) -> Result<QuickCleanResult, String> {
    let start_time = std::time::Instant::now();
    let drive_letter = drive.chars().next().unwrap_or('C').to_ascii_uppercase();

    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".to_string());
    let program_data = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());

    let specs: Vec<CategorySpec> = if drive_letter == 'C' {
        vec![
            CategorySpec::new(
                "windows_old",
                "Previous Windows Installations",
                "Backup of old Windows installations (Windows.old) retained after upgrades",
                vec![std::path::PathBuf::from("C:\\Windows.old")],
                4,
                false,
                false,
            ),
            CategorySpec::new(
                "delivery_opt",
                "Delivery Optimization Files",
                "Previously downloaded peer-to-peer Windows and Store updates",
                vec![
                    std::path::PathBuf::from(&windir).join("SoftwareDistribution").join("DeliveryOptimization").join("Cache"),
                    std::path::PathBuf::from(&program_data).join("Microsoft").join("Network").join("Downloader"),
                ],
                4,
                true,
                true,
            ),
            CategorySpec::new(
                "driver_store",
                "Device Driver Staging Packages",
                "Temporary backup files created when installing graphics and hardware drivers",
                vec![
                    std::path::PathBuf::from(&windir).join("System32").join("DriverStore").join("Temp"),
                ],
                4,
                true,
                true,
            ),
            CategorySpec::new(
                "directx_cache",
                "DirectX & GPU Shader Cache",
                "Precompiled GPU shaders from games, apps, NVIDIA and AMD graphics",
                vec![
                    std::path::PathBuf::from(&local_appdata).join("D3DSCache"),
                    std::path::PathBuf::from(&local_appdata).join("NVIDIA").join("DXCache"),
                    std::path::PathBuf::from(&local_appdata).join("AMD").join("DxCache"),
                    std::path::PathBuf::from(&local_appdata).join("Intel").join("ShaderCache"),
                ],
                3,
                true,
                true,
            ),
            CategorySpec::new(
                "memory_dump",
                "System Crash Memory Dumps",
                "Full kernel crash dumps and minidump diagnostic files",
                vec![
                    std::path::PathBuf::from(&windir).join("MEMORY.DMP"),
                    std::path::PathBuf::from(&windir).join("Minidump"),
                ],
                2,
                true,
                true,
            ),
            CategorySpec::new(
                "prefetch",
                "Windows Prefetch Data",
                "Obsolete application launch optimization traces",
                vec![std::path::PathBuf::from(&windir).join("Prefetch")],
                2,
                false,
                true,
            ),
            CategorySpec::new(
                "thumb_cache",
                "File Explorer Thumbnail Cache",
                "Cached image and video preview thumbnails (thumbcache databases)",
                vec![std::path::PathBuf::from(&local_appdata).join("Microsoft").join("Windows").join("Explorer")],
                2,
                true,
                true,
            ),
            CategorySpec::new(
                "recycle_bin",
                "Complete Recycle Bin",
                "Permanently erase all deleted files sitting in the Recycle Bin",
                vec![std::path::PathBuf::from("C:\\$Recycle.Bin")],
                4,
                true,
                true,
            ),
        ]
    } else {
        let root = format!("{}:\\", drive_letter);
        vec![
            CategorySpec::new(
                "recycle_bin",
                format!("Recycle Bin ({}:)", drive_letter),
                "Permanently erase all deleted files sitting in the Recycle Bin on this drive",
                vec![std::path::PathBuf::from(&root).join("$Recycle.Bin")],
                4,
                true,
                true,
            ),
            CategorySpec::new(
                "driver_temp",
                format!("Driver & System Temp ({}:)", drive_letter),
                "Temporary driver and system files stored on this drive",
                vec![std::path::PathBuf::from(&root).join("Temp")],
                3,
                true,
                true,
            ),
        ]
    };

    let categories: Vec<CleanCategoryItem> = specs
        .into_par_iter()
        .map(|spec| {
            let mut cat_size = 0u64;
            let mut cat_files = 0usize;

            for p in &spec.paths {
                if p.exists() {
                    let path_str = p.to_string_lossy();
                    let (sz, cnt) = fast_win32_scan_dir(&path_str, spec.max_depth, 0);
                    cat_size += sz;
                    cat_files += cnt;
                }
            }

            let display_path = spec
                .paths
                .first()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            CleanCategoryItem {
                id: spec.id.to_string(),
                name: spec.name.to_string(),
                description: spec.description.to_string(),
                path: display_path,
                size_bytes: cat_size,
                file_count: cat_files,
                is_selected: spec.is_selected,
                is_safe: spec.is_safe,
            }
        })
        .collect();

    let total_size_bytes = categories.iter().map(|c| c.size_bytes).sum();
    let total_files = categories.iter().map(|c| c.file_count).sum();
    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    Ok(QuickCleanResult {
        total_size_bytes,
        total_files,
        categories,
        elapsed_ms,
    })
}

#[tauri::command]
pub async fn deep_clean_purge(drive: String, category_ids: Vec<String>) -> Result<(u64, usize), String> {
    let drive_letter = drive.chars().next().unwrap_or('C').to_ascii_uppercase();
    let mut total_freed = 0u64;
    let mut total_removed = 0usize;

    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".to_string());
    let program_data = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());

    for cat_id in category_ids {
        match cat_id.as_str() {
            "windows_old" => {
                let p = std::path::PathBuf::from("C:\\Windows.old");
                let (f, c) = purge_dir_contents(&p);
                total_freed += f;
                total_removed += c;
            }
            "delivery_opt" => {
                let p1 = std::path::PathBuf::from(&windir).join("SoftwareDistribution").join("DeliveryOptimization").join("Cache");
                let p2 = std::path::PathBuf::from(&program_data).join("Microsoft").join("Network").join("Downloader");
                let (f1, c1) = purge_dir_contents(&p1);
                let (f2, c2) = purge_dir_contents(&p2);
                total_freed += f1 + f2;
                total_removed += c1 + c2;
            }
            "driver_store" => {
                let p = std::path::PathBuf::from(&windir).join("System32").join("DriverStore").join("Temp");
                let (f, c) = purge_dir_contents(&p);
                total_freed += f;
                total_removed += c;
            }
            "directx_cache" => {
                for p in [
                    std::path::PathBuf::from(&local_appdata).join("D3DSCache"),
                    std::path::PathBuf::from(&local_appdata).join("NVIDIA").join("DXCache"),
                    std::path::PathBuf::from(&local_appdata).join("AMD").join("DxCache"),
                    std::path::PathBuf::from(&local_appdata).join("Intel").join("ShaderCache"),
                ] {
                    let (f, c) = purge_dir_contents(&p);
                    total_freed += f;
                    total_removed += c;
                }
            }
            "memory_dump" => {
                let p1 = std::path::PathBuf::from(&windir).join("MEMORY.DMP");
                if p1.exists() {
                    if let Ok(meta) = p1.metadata() {
                        let sz = meta.len();
                        if std::fs::remove_file(&p1).is_ok() {
                            total_freed += sz;
                            total_removed += 1;
                        }
                    }
                }
                let p2 = std::path::PathBuf::from(&windir).join("Minidump");
                let (f2, c2) = purge_dir_contents(&p2);
                total_freed += f2;
                total_removed += c2;
            }
            "prefetch" => {
                let p = std::path::PathBuf::from(&windir).join("Prefetch");
                let (f, c) = purge_dir_contents(&p);
                total_freed += f;
                total_removed += c;
            }
            "thumb_cache" => {
                let p = std::path::PathBuf::from(&local_appdata).join("Microsoft").join("Windows").join("Explorer");
                if let Ok(entries) = std::fs::read_dir(&p) {
                    for entry in entries.flatten() {
                        let file_name = entry.file_name().to_string_lossy().to_string();
                        if file_name.starts_with("thumbcache_") && file_name.ends_with(".db") {
                            if let Ok(meta) = entry.metadata() {
                                let sz = meta.len();
                                if std::fs::remove_file(entry.path()).is_ok() {
                                    total_freed += sz;
                                    total_removed += 1;
                                }
                            }
                        }
                    }
                }
            }
            "recycle_bin" => {
                let root = format!("{}:\\$Recycle.Bin", drive_letter);
                let p = std::path::PathBuf::from(&root);
                let (f, c) = purge_dir_contents(&p);
                total_freed += f;
                total_removed += c;
            }
            _ => {}
        }
    }

    Ok((total_freed, total_removed))
}


// ==========================================================================
// Dev Cleaner Engine (Pruned Project Artifact Scanner)
// ==========================================================================

fn find_dev_artifacts(
    current_path: &std::path::Path,
    max_depth: usize,
    current_depth: usize,
    results: &mut Vec<crate::models::DevCleanItem>,
) {
    if current_depth > max_depth || !current_path.exists() {
        return;
    }

    let search_pattern = format!("{}\\*", current_path.to_string_lossy().trim_end_matches(['\\', '/']));
    let mut wide: Vec<u16> = search_pattern.encode_utf16().collect();
    wide.push(0);

    let mut find_data: WIN32_FIND_DATAW = unsafe { std::mem::zeroed() };
    let handle = unsafe {
        FindFirstFileExW(
            wide.as_ptr(),
            FindExInfoBasic,
            &mut find_data as *mut _ as *mut _,
            FindExSearchNameMatch,
            std::ptr::null(),
            FIND_FIRST_EX_LARGE_FETCH,
        )
    };

    if handle == INVALID_HANDLE_VALUE {
        return;
    }

    let mut subdirs_to_recurse = Vec::new();

    loop {
        let name_len = find_data.cFileName.iter().position(|&c| c == 0).unwrap_or(find_data.cFileName.len());
        let is_dot = name_len == 1 && find_data.cFileName[0] == b'.' as u16;
        let is_dotdot = name_len == 2 && find_data.cFileName[0] == b'.' as u16 && find_data.cFileName[1] == b'.' as u16;

        if !is_dot && !is_dotdot && name_len > 0 {
            let attrs = find_data.dwFileAttributes;
            let is_dir = (attrs & FILE_ATTRIBUTE_DIRECTORY) != 0;
            let is_reparse = (attrs & FILE_ATTRIBUTE_REPARSE_POINT) != 0;

            if is_dir && !is_reparse {
                if let Ok(name) = String::from_utf16(&find_data.cFileName[..name_len]) {
                    let sub_path = current_path.join(&name);
                    let name_lower = name.to_lowercase();

                    let is_dev_artifact = matches!(
                        name_lower.as_str(),
                        "node_modules" | "target" | ".venv" | "venv" | "__pycache__" | ".next" | ".nuxt" | "dist" | "build" | ".gradle" | ".dart_tool"
                    );

                    if is_dev_artifact {
                        let (size, count) = fast_win32_scan_dir(&sub_path.to_string_lossy(), 10, 0);
                        if size > 0 {
                            let parent_name = current_path
                                .file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_else(|| "Project".to_string());

                            results.push(crate::models::DevCleanItem {
                                id: sub_path.to_string_lossy().to_string(),
                                project_name: parent_name,
                                artifact_type: name,
                                path: sub_path.to_string_lossy().to_string(),
                                size_bytes: size,
                                file_count: count,
                                is_selected: true,
                            });
                        }
                    } else if !name_lower.starts_with('.') && name_lower != "$recycle.bin" && name_lower != "system volume information" && name_lower != "windows" && name_lower != "program files" && name_lower != "program files (x86)" && name_lower != "appdata" {
                        subdirs_to_recurse.push(sub_path);
                    }
                }
            }
        }

        if unsafe { FindNextFileW(handle, &mut find_data) } == 0 {
            break;
        }
    }

    unsafe {
        FindClose(handle);
    }

    for sub in subdirs_to_recurse {
        find_dev_artifacts(&sub, max_depth, current_depth + 1, results);
    }
}

#[tauri::command]
pub async fn dev_clean_scan(drive: String) -> Result<crate::models::DevCleanResult, String> {
    let start_time = std::time::Instant::now();
    let drive_letter = drive.chars().next().unwrap_or('C').to_ascii_uppercase();

    let mut scan_roots = Vec::new();
    if drive_letter == 'C' {
        let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Default".to_string());
        let up = std::path::PathBuf::from(&user_profile);
        for candidate in ["Personal Projects", "Projects", "Documents", "source", "dev", "workspace", "Desktop"] {
            let p = up.join(candidate);
            if p.exists() {
                scan_roots.push(p);
            }
        }
        if scan_roots.is_empty() {
            scan_roots.push(up);
        }
    } else {
        scan_roots.push(std::path::PathBuf::from(format!("{}:\\", drive_letter)));
    }

    let mut all_items = Vec::new();
    for root in scan_roots {
        let mut root_items = Vec::new();
        find_dev_artifacts(&root, 6, 0, &mut root_items);
        all_items.extend(root_items);
    }

    all_items.sort_by_key(|a| std::cmp::Reverse(a.size_bytes));

    let total_size_bytes = all_items.iter().map(|i| i.size_bytes).sum();
    let total_artifacts = all_items.len();
    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    Ok(crate::models::DevCleanResult {
        total_size_bytes,
        total_artifacts,
        items: all_items,
        elapsed_ms,
    })
}

#[tauri::command]
pub async fn dev_clean_purge(item_paths: Vec<String>) -> Result<(u64, usize), String> {
    let mut total_freed = 0u64;
    let mut total_removed = 0usize;

    for path_str in item_paths {
        let p = std::path::PathBuf::from(&path_str);
        if p.exists() && p.is_dir() {
            let (freed, count) = purge_dir_contents(&p);
            let _ = std::fs::remove_dir_all(&p);
            total_freed += freed;
            total_removed += count;
        }
    }

    Ok((total_freed, total_removed))
}


// ==========================================================================
// Duplicate Finder Engine (Fast 3-Tier Hash & Cluster Matcher)
// ==========================================================================

fn fast_partial_hash(path: &std::path::Path) -> Option<u64> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut buffer = [0u8; 4096];
    let bytes_read = file.read(&mut buffer).ok()?;
    if bytes_read == 0 {
        return None;
    }

    let mut hash = 0xcbf29ce484222325u64;
    for &b in &buffer[..bytes_read] {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    Some(hash)
}

fn fast_full_hash(path: &std::path::Path) -> Option<u64> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut buffer = [0u8; 16384];
    let mut hash = 0xcbf29ce484222325u64;

    loop {
        let bytes_read = file.read(&mut buffer).ok()?;
        if bytes_read == 0 {
            break;
        }
        for &b in &buffer[..bytes_read] {
            hash ^= b as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
    }
    Some(hash)
}

fn collect_candidate_files(
    current_path: &std::path::Path,
    max_depth: usize,
    current_depth: usize,
    files_out: &mut Vec<(String, u64)>,
) {
    if current_depth > max_depth || !current_path.exists() {
        return;
    }

    let search_pattern = format!("{}\\*", current_path.to_string_lossy().trim_end_matches(['\\', '/']));
    let mut wide: Vec<u16> = search_pattern.encode_utf16().collect();
    wide.push(0);

    let mut find_data: WIN32_FIND_DATAW = unsafe { std::mem::zeroed() };
    let handle = unsafe {
        FindFirstFileExW(
            wide.as_ptr(),
            FindExInfoBasic,
            &mut find_data as *mut _ as *mut _,
            FindExSearchNameMatch,
            std::ptr::null(),
            FIND_FIRST_EX_LARGE_FETCH,
        )
    };

    if handle == INVALID_HANDLE_VALUE {
        return;
    }

    let mut subdirs = Vec::new();

    loop {
        let name_len = find_data.cFileName.iter().position(|&c| c == 0).unwrap_or(find_data.cFileName.len());
        let is_dot = name_len == 1 && find_data.cFileName[0] == b'.' as u16;
        let is_dotdot = name_len == 2 && find_data.cFileName[0] == b'.' as u16 && find_data.cFileName[1] == b'.' as u16;

        if !is_dot && !is_dotdot && name_len > 0 {
            let attrs = find_data.dwFileAttributes;
            let is_dir = (attrs & FILE_ATTRIBUTE_DIRECTORY) != 0;
            let is_reparse = (attrs & FILE_ATTRIBUTE_REPARSE_POINT) != 0;

            if is_dir {
                if !is_reparse && current_depth < max_depth {
                    if let Ok(name) = String::from_utf16(&find_data.cFileName[..name_len]) {
                        let name_lower = name.to_lowercase();
                        if !name_lower.starts_with('.') && name_lower != "$recycle.bin" && name_lower != "system volume information" && name_lower != "windows" && name_lower != "appdata" {
                            subdirs.push(current_path.join(name));
                        }
                    }
                }
            } else {
                let size = ((find_data.nFileSizeHigh as u64) << 32) | (find_data.nFileSizeLow as u64);
                if size >= 10 * 1024 {
                    if let Ok(name) = String::from_utf16(&find_data.cFileName[..name_len]) {
                        let file_path = current_path.join(name);
                        files_out.push((file_path.to_string_lossy().to_string(), size));
                    }
                }
            }
        }

        if unsafe { FindNextFileW(handle, &mut find_data) } == 0 {
            break;
        }
    }

    unsafe {
        FindClose(handle);
    }

    for sub in subdirs {
        collect_candidate_files(&sub, max_depth, current_depth + 1, files_out);
    }
}

#[tauri::command]
pub async fn duplicate_scan(drive: String) -> Result<crate::models::DuplicateFinderResult, String> {
    let start_time = std::time::Instant::now();
    let drive_letter = drive.chars().next().unwrap_or('C').to_ascii_uppercase();

    let mut scan_roots = Vec::new();
    if drive_letter == 'C' {
        let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Default".to_string());
        let up = std::path::PathBuf::from(&user_profile);
        for sub in ["Downloads", "Documents", "Desktop", "Pictures", "Videos", "Music"] {
            let p = up.join(sub);
            if p.exists() {
                scan_roots.push(p);
            }
        }
    } else {
        scan_roots.push(std::path::PathBuf::from(format!("{}:\\", drive_letter)));
    }

    let mut all_files = Vec::new();
    for root in scan_roots {
        collect_candidate_files(&root, 5, 0, &mut all_files);
    }

    let mut size_map: std::collections::HashMap<u64, Vec<String>> = std::collections::HashMap::new();
    for (path, size) in all_files {
        size_map.entry(size).or_default().push(path);
    }

    let candidate_groups: Vec<(u64, Vec<String>)> = size_map
        .into_iter()
        .filter(|(_, paths)| paths.len() >= 2)
        .collect();

    let duplicate_groups: Vec<crate::models::DuplicateGroup> = candidate_groups
        .into_par_iter()
        .flat_map(|(size, paths)| {
            let mut partial_map: std::collections::HashMap<u64, Vec<String>> = std::collections::HashMap::new();
            for p in paths {
                let path_buf = std::path::PathBuf::from(&p);
                if let Some(h) = fast_partial_hash(&path_buf) {
                    partial_map.entry(h).or_default().push(p);
                }
            }

            let mut groups = Vec::new();
            for (_part_h, p_paths) in partial_map {
                if p_paths.len() >= 2 {
                    let mut full_map: std::collections::HashMap<u64, Vec<String>> = std::collections::HashMap::new();
                    for p in p_paths {
                        let path_buf = std::path::PathBuf::from(&p);
                        if let Some(fh) = fast_full_hash(&path_buf) {
                            full_map.entry(fh).or_default().push(p);
                        }
                    }

                    for (fh, matched_paths) in full_map {
                        if matched_paths.len() >= 2 {
                            let file_name = std::path::Path::new(&matched_paths[0])
                                .file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_else(|| "Duplicate".to_string());

                            let wasted = (matched_paths.len() - 1) as u64 * size;
                            let files = matched_paths
                                .iter()
                                .enumerate()
                                .map(|(idx, path)| crate::models::DuplicateFileItem {
                                    path: path.clone(),
                                    size_bytes: size,
                                    is_selected: idx > 0,
                                })
                                .collect();

                            groups.push(crate::models::DuplicateGroup {
                                id: format!("{}_{:x}", file_name, fh),
                                file_name,
                                size_bytes: size,
                                wasted_bytes: wasted,
                                files,
                            });
                        }
                    }
                }
            }
            groups
        })
        .collect();

    let mut sorted_groups = duplicate_groups;
    sorted_groups.sort_by_key(|a| std::cmp::Reverse(a.wasted_bytes));

    let total_wasted_bytes = sorted_groups.iter().map(|g| g.wasted_bytes).sum();
    let total_duplicate_files = sorted_groups.iter().map(|g| g.files.len() - 1).sum();
    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    Ok(crate::models::DuplicateFinderResult {
        total_wasted_bytes,
        total_duplicate_files,
        groups: sorted_groups,
        elapsed_ms,
    })
}

#[tauri::command]
pub async fn duplicate_purge(file_paths: Vec<String>) -> Result<(u64, usize), String> {
    let mut total_freed = 0u64;
    let mut total_removed = 0usize;

    for path_str in file_paths {
        let p = std::path::PathBuf::from(&path_str);
        if p.exists() && p.is_file() {
            if let Ok(meta) = p.metadata() {
                let sz = meta.len();
                if std::fs::remove_file(&p).is_ok() {
                    total_freed += sz;
                    total_removed += 1;
                }
            }
        }
    }

    Ok((total_freed, total_removed))
}

fn get_dir_size_and_count_shallow(path: &std::path::Path, max_depth: usize) -> (u64, usize) {
    if !path.exists() {
        return (0, 0);
    }
    let mut total_size = 0u64;
    let mut total_count = 0usize;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total_size += meta.len();
                    total_count += 1;
                } else if meta.is_dir() && max_depth > 0 {
                    let (s, c) = get_dir_size_and_count_shallow(&entry.path(), max_depth - 1);
                    total_size += s;
                    total_count += c;
                }
            }
        }
    }
    (total_size, total_count)
}

#[tauri::command]
pub fn list_category_children(path: String) -> Result<Vec<crate::models::CategoryChildItem>, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(Vec::new());
    }
    let mut items = Vec::new();
    if let Ok(entries) = std::fs::read_dir(p) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let mut is_dir = false;
            let mut size = 0u64;
            let mut count = 1;
            if let Ok(meta) = entry.metadata() {
                is_dir = meta.is_dir();
                if is_dir {
                    let (s, c) = get_dir_size_and_count_shallow(&entry_path, 2);
                    size = s;
                    count = c;
                } else {
                    size = meta.len();
                }
            }
            items.push(crate::models::CategoryChildItem {
                name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir,
                size_bytes: size,
                file_count: count,
            });
        }
    }
    items.sort_by_key(|a| std::cmp::Reverse(a.size_bytes));
    if items.len() > 60 {
        items.truncate(60);
    }
    Ok(items)
}

#[tauri::command]
pub async fn purge_specific_paths(paths: Vec<String>) -> Result<(u64, usize), String> {
    let mut freed = 0u64;
    let mut count = 0usize;
    for p_str in paths {
        let p = std::path::PathBuf::from(&p_str);
        if p.exists() {
            if p.is_dir() {
                let (f, c) = purge_dir_contents(&p);
                let _ = std::fs::remove_dir_all(&p);
                freed += f;
                count += c;
            } else if let Ok(meta) = p.metadata() {
                let len = meta.len();
                if std::fs::remove_file(&p).is_ok() {
                    freed += len;
                    count += 1;
                }
            }
        }
    }
    Ok((freed, count))
}

fn find_space_saver_candidates(
    root: &std::path::Path,
    max_depth: usize,
    current_depth: usize,
    results: &mut Vec<crate::models::SpaceSaverItem>,
) {
    if current_depth > max_depth {
        return;
    }

    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('$')
            || name == "System Volume Information"
            || name == "Windows"
            || name == "node_modules"
            || name == ".git"
        {
            continue;
        }

        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        if meta.is_dir() {
            if current_depth >= 1 && current_depth <= 3 {
                let (dir_size, dir_files) = get_dir_size_and_count_shallow(&path, 3);
                if dir_size >= 40 * 1024 * 1024 && dir_files > 3 {
                    let ratio_pct = 50u32;
                    let savings = (dir_size * ratio_pct as u64) / 100;
                    results.push(crate::models::SpaceSaverItem {
                        id: format!("dir_{}", path.to_string_lossy()),
                        name: name.clone(),
                        path: path.to_string_lossy().to_string(),
                        is_dir: true,
                        original_size_bytes: dir_size,
                        estimated_compressed_bytes: dir_size - savings,
                        estimated_savings_bytes: savings,
                        compression_ratio_pct: ratio_pct,
                        category: "Bulky Folder".to_string(),
                        file_count: dir_files,
                        is_selected: true,
                    });
                    continue;
                }
            }

            find_space_saver_candidates(&path, max_depth, current_depth + 1, results);
        } else {
            let file_size = meta.len();
            if file_size >= 15 * 1024 * 1024 {
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_ascii_lowercase())
                    .unwrap_or_default();

                let (is_candidate, ratio_pct, category) = match ext.as_str() {
                    "log" | "txt" | "json" | "xml" | "yaml" | "yml" => (true, 75u32, "Log / Text"),
                    "csv" | "sql" | "dump" | "bak" | "dat" | "db" => (true, 65u32, "Database / Dataset"),
                    "bmp" | "wav" | "raw" | "tga" | "psd" => (true, 60u32, "Uncompressed Media"),
                    "iso" | "vmdk" | "vdi" | "qcow2" | "img" => (true, 40u32, "Disk Image / VM"),
                    "tar" => (true, 50u32, "Uncompressed Archive"),
                    "exe" | "dll" | "pdb" | "bin" => (true, 45u32, "Binary / Executable"),
                    _ => {
                        if file_size >= 50 * 1024 * 1024
                            && !matches!(
                                ext.as_str(),
                                "zip" | "7z" | "rar" | "gz" | "xz" | "bz2" | "mp4" | "mkv" | "jpg" | "jpeg" | "png" | "webp" | "mp3" | "aac"
                            )
                        {
                            (true, 40u32, "Large File")
                        } else {
                            (false, 0u32, "")
                        }
                    }
                };

                if is_candidate {
                    let savings = (file_size * ratio_pct as u64) / 100;
                    results.push(crate::models::SpaceSaverItem {
                        id: format!("file_{}", path.to_string_lossy()),
                        name: name.clone(),
                        path: path.to_string_lossy().to_string(),
                        is_dir: false,
                        original_size_bytes: file_size,
                        estimated_compressed_bytes: file_size - savings,
                        estimated_savings_bytes: savings,
                        compression_ratio_pct: ratio_pct,
                        category: category.to_string(),
                        file_count: 1,
                        is_selected: true,
                    });
                }
            }
        }
    }
}

#[tauri::command]
pub async fn space_saver_scan(drive: String) -> Result<crate::models::SpaceSaverResult, String> {
    let start_time = std::time::Instant::now();
    let drive_letter = drive.chars().next().unwrap_or('C').to_ascii_uppercase();

    let mut scan_roots = Vec::new();
    if drive_letter == 'C' {
        let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Default".to_string());
        let up = std::path::PathBuf::from(&user_profile);
        for candidate in ["Downloads", "Documents", "Desktop", "Saved Games", "Videos", "Projects", "Personal Projects", "source", "dev"] {
            let p = up.join(candidate);
            if p.exists() {
                scan_roots.push((p, 4));
            }
        }
        let crash_dumps = std::path::PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".to_string())).join("CrashDumps");
        if crash_dumps.exists() {
            scan_roots.push((crash_dumps, 2));
        }
        let prog_data = std::path::PathBuf::from(std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string()));
        if prog_data.exists() {
            scan_roots.push((prog_data, 2));
        }
    } else {
        scan_roots.push((std::path::PathBuf::from(format!("{}:\\", drive_letter)), 3));
    }

    let mut all_items = Vec::new();
    for (root, depth) in scan_roots {
        let mut root_items = Vec::new();
        find_space_saver_candidates(&root, depth, 0, &mut root_items);
        all_items.extend(root_items);
    }

    all_items.sort_by_key(|a| std::cmp::Reverse(a.estimated_savings_bytes));
    if all_items.len() > 100 {
        all_items.truncate(100);
    }

    let total_original_bytes = all_items.iter().map(|i| i.original_size_bytes).sum();
    let total_estimated_compressed_bytes = all_items.iter().map(|i| i.estimated_compressed_bytes).sum();
    let total_estimated_savings_bytes = all_items.iter().map(|i| i.estimated_savings_bytes).sum();
    let total_items = all_items.len();
    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    Ok(crate::models::SpaceSaverResult {
        total_original_bytes,
        total_estimated_compressed_bytes,
        total_estimated_savings_bytes,
        total_items,
        items: all_items,
        elapsed_ms,
    })
}

#[tauri::command]
pub async fn space_saver_compress(
    options: crate::models::SpaceSaverCompressOptions,
) -> Result<crate::models::SpaceSaverCompressResult, String> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let mut processed_count = 0usize;
    let mut original_bytes = 0u64;
    let mut final_bytes = 0u64;
    let mut freed_bytes = 0u64;

    for path_str in &options.paths {
        let p = std::path::Path::new(path_str);
        if !p.exists() {
            continue;
        }

        let is_dir = p.is_dir();
        let orig_sz = if is_dir {
            let (sz, _) = get_dir_size_and_count_shallow(p, 4);
            sz
        } else {
            p.metadata().map(|m| m.len()).unwrap_or(0)
        };

        if options.mode == "zip" {
            let parent = p.parent().unwrap_or(std::path::Path::new("."));
            let file_stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("archive");
            let mut zip_dest = parent.join(format!("{}.zip", file_stem));
            if zip_dest.exists() {
                let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
                zip_dest = parent.join(format!("{}_{}.zip", file_stem, ts));
            }

            let zip_str = zip_dest.to_string_lossy().to_string();
            let name_str = p.file_name().and_then(|s| s.to_str()).unwrap_or(path_str);

            let mut success = false;
            let tar_result = std::process::Command::new("tar.exe")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["-a", "-c", "-f", &zip_str, name_str])
                .current_dir(parent)
                .status();

            if let Ok(st) = tar_result {
                if st.success() && zip_dest.exists() {
                    success = true;
                }
            }

            if !success {
                let script = format!(
                    "Compress-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
                    path_str.replace('\'', "''"),
                    zip_str.replace('\'', "''")
                );
                let ps_result = std::process::Command::new("powershell")
                    .creation_flags(CREATE_NO_WINDOW)
                    .args(["-NoProfile", "-NonInteractive", "-Command", &script])
                    .status();

                if let Ok(st) = ps_result {
                    if st.success() && zip_dest.exists() {
                        success = true;
                    }
                }
            }

            if success {
                let zip_len = zip_dest.metadata().map(|m| m.len()).unwrap_or(0);
                original_bytes += orig_sz;
                final_bytes += zip_len;
                processed_count += 1;

                if options.remove_original {
                    let _ = delete_to_trash(path_str.clone());
                    freed_bytes += orig_sz.saturating_sub(zip_len);
                }
            }
        } else if options.mode == "compact" {
            let target_arg = if is_dir {
                format!("{}\\*", path_str)
            } else {
                path_str.to_string()
            };

            let mut cmd = std::process::Command::new("compact.exe");
            cmd.creation_flags(CREATE_NO_WINDOW);
            if is_dir {
                cmd.args(["/C", "/S", "/I", "/EXE:LZX", &target_arg]);
            } else {
                cmd.args(["/C", "/EXE:LZX", &target_arg]);
            }

            if let Ok(st) = cmd.status() {
                if st.success() {
                    processed_count += 1;
                    original_bytes += orig_sz;
                    let estimated_compressed = (orig_sz * 55) / 100;
                    final_bytes += estimated_compressed;
                    freed_bytes += orig_sz.saturating_sub(estimated_compressed);
                }
            }
        }
    }

    let mode_label = if options.mode == "zip" { "ZIP Archive" } else { "NTFS LZX Compression" };
    let message = if options.remove_original && options.mode == "zip" {
        format!("Successfully created {} {} archive(s) and moved original files to Recycle Bin.", processed_count, mode_label)
    } else {
        format!("Successfully processed {} item(s) using {}.", processed_count, mode_label)
    };

    Ok(crate::models::SpaceSaverCompressResult {
        success: true,
        processed_count,
        original_bytes,
        final_bytes,
        freed_bytes,
        message,
    })
}
