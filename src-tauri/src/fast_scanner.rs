use crossbeam_deque::{Injector, Steal, Stealer, Worker};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Instant;
use tauri::Emitter;

#[cfg(windows)]
use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
#[cfg(windows)]
use windows_sys::Win32::Storage::FileSystem::{
    FindClose, FindFirstFileExW, FindNextFileW, FindExInfoBasic,
    FindExSearchNameMatch, FIND_FIRST_EX_LARGE_FETCH,
    FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT, WIN32_FIND_DATAW,
};

use crate::models::{ExtensionStat, FileNode, ScanProgress};

#[derive(Default)]
pub struct ScanState {
    pub nodes: Vec<FileNode>,
    pub root_id: usize,
    pub extension_stats: Vec<ExtensionStat>,
    pub total_files: u64,
    pub total_dirs: u64,
    pub total_bytes: u64,
    pub elapsed_ms: u64,
    pub root_path: String,
}

pub fn get_category_and_color(ext: &str) -> (&'static str, &'static str) {
    let ext_lower = ext.to_lowercase();
    match ext_lower.as_str() {
        // Video
        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" => ("Video", "#8b5cf6"),
        // Audio
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma" => ("Audio", "#ec4899"),
        // Images
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "bmp" | "ico" | "tiff" | "psd" => {
            ("Image", "#10b981")
        }
        // Archives
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "iso" | "cab" | "dmg" => {
            ("Archive", "#f59e0b")
        }
        // Executables / Binaries
        "exe" | "dll" | "sys" | "msi" | "bin" | "so" | "dylib" | "apk" | "msix" => {
            ("Binary", "#ef4444")
        }
        // Documents
        "pdf" | "docx" | "doc" | "xlsx" | "xls" | "pptx" | "ppt" | "txt" | "rtf" | "epub" => {
            ("Document", "#3b82f6")
        }
        // Code / Data
        "rs" | "js" | "ts" | "jsx" | "tsx" | "py" | "java" | "c" | "cpp" | "h" | "hpp" | "cs"
        | "html" | "css" | "json" | "xml" | "yaml" | "yml" | "sql" | "db" | "sqlite" => {
            ("Code & Data", "#06b6d4")
        }
        _ => ("Other", "#6b7280"),
    }
}

/// Dynamically determine the optimal worker thread count based on CPU architecture and OS I/O behavior.
pub fn determine_optimal_worker_threads() -> usize {
    let available = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);

    // Dynamic Sizing Heuristic:
    // - On low-core systems (<= 2 cores): Use 2 threads to maintain responsiveness while keeping 1 active scanner.
    // - On standard systems (4-16 cores): Match available parallelism 1:1 to saturate NVMe queue depth (QD=16..32).
    // - On ultra-high-core systems (> 16 cores): Cap at 32 threads. Beyond 32 concurrent FindFirstFile traversals,
    //   NTFS kernel driver FCB/SCB lock contention becomes the bottleneck rather than disk I/O.
    available.clamp(2, 32)
}

struct RawFileEntry {
    name: String,
    path: String,
    size: u64,
    extension: Option<String>,
    modified: u64,
}

struct RawDirResult {
    dir_id: usize,
    parent_id: Option<usize>,
    name: String,
    path: String,
    modified: u64,
    files: Vec<RawFileEntry>,
    subdir_ids: Vec<usize>,
}

#[cfg(windows)]
fn to_wide_null(s: &str) -> Vec<u16> {
    let mut v: Vec<u16> = s.encode_utf16().collect();
    v.push(0);
    v
}

#[cfg(windows)]
fn is_dot_or_dotdot(c_file_name: &[u16]) -> bool {
    if c_file_name[0] == b'.' as u16 {
        if c_file_name[1] == 0 {
            return true;
        }
        if c_file_name[1] == b'.' as u16 && c_file_name[2] == 0 {
            return true;
        }
    }
    false
}

#[cfg(windows)]
fn u16_len(slice: &[u16]) -> usize {
    let mut len = 0;
    while len < slice.len() && slice[len] != 0 {
        len += 1;
    }
    len
}

#[cfg(windows)]
fn filetime_to_unix_secs(ft_high: u32, ft_low: u32) -> u64 {
    let ft = ((ft_high as u64) << 32) | (ft_low as u64);
    // 100-ns intervals between 1601-01-01 and 1970-01-01
    const EPOCH_DIFFERENCE: u64 = 116_444_736_000_000_000;
    if ft >= EPOCH_DIFFERENCE {
        (ft - EPOCH_DIFFERENCE) / 10_000_000
    } else {
        0
    }
}

struct WorkTask {
    dir_id: usize,
    parent_id: Option<usize>,
    dir_path: String,
    dir_name: String,
    dir_modified: u64,
}

fn find_task<T>(
    local: &Worker<T>,
    injector: &Injector<T>,
    stealers: &[Stealer<T>],
) -> Option<T> {
    // 1. Pop local LIFO task (NTFS cache friendly)
    if let Some(task) = local.pop() {
        return Some(task);
    }

    // 2. Steal batch from global injector
    loop {
        match injector.steal_batch_and_pop(local) {
            Steal::Success(task) => return Some(task),
            Steal::Empty => break,
            Steal::Retry => {}
        }
    }

    // 3. Steal batch from peer workers
    for stealer in stealers {
        loop {
            match stealer.steal_batch_and_pop(local) {
                Steal::Success(task) => return Some(task),
                Steal::Empty => break,
                Steal::Retry => {}
            }
        }
    }

    None
}

pub fn perform_scan<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    target_path: String,
    cancel_flag: Arc<AtomicBool>,
) -> Result<ScanState, String> {
    let start_time = Instant::now();
    let root_path_buf = PathBuf::from(&target_path);

    if !root_path_buf.exists() {
        return Err(format!("Path does not exist: {}", target_path));
    }

    let num_threads = determine_optimal_worker_threads();
    println!(
        "[FastScanner] Dynamically allocated {} Chase-Lev worker threads for scanning '{}'",
        num_threads, target_path
    );

    let root_name = root_path_buf
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| target_path.clone());

    let injector: Arc<Injector<WorkTask>> = Arc::new(Injector::new());
    injector.push(WorkTask {
        dir_id: 0,
        parent_id: None,
        dir_path: target_path.clone(),
        dir_name: root_name.clone(),
        dir_modified: 0,
    });

    let mut workers = Vec::with_capacity(num_threads);
    let mut stealers = Vec::with_capacity(num_threads);

    for _ in 0..num_threads {
        let w = Worker::new_lifo();
        stealers.push(w.stealer());
        workers.push(w);
    }

    let next_dir_id = Arc::new(AtomicUsize::new(1));
    let active_workers = Arc::new(AtomicUsize::new(num_threads));
    let files_counter = Arc::new(AtomicU64::new(0));
    let dirs_counter = Arc::new(AtomicU64::new(1)); // Root is 1
    let bytes_counter = Arc::new(AtomicU64::new(0));
    let last_progress_ms = Arc::new(AtomicU64::new(0));

    let mut thread_handles = Vec::with_capacity(num_threads);

    for (thread_id, worker) in workers.into_iter().enumerate() {
        let injector = Arc::clone(&injector);
        let active = Arc::clone(&active_workers);
        let next_id = Arc::clone(&next_dir_id);
        let cancel = Arc::clone(&cancel_flag);
        let files_cnt = Arc::clone(&files_counter);
        let dirs_cnt = Arc::clone(&dirs_counter);
        let bytes_cnt = Arc::clone(&bytes_counter);
        let last_prog = Arc::clone(&last_progress_ms);
        let app_handle_clone = app_handle.clone();

        let my_stealers: Vec<Stealer<WorkTask>> = stealers
            .iter()
            .enumerate()
            .filter(|(i, _)| *i != thread_id)
            .map(|(_, s)| s.clone())
            .collect();

        thread_handles.push(thread::spawn(move || {
            let mut local_results: Vec<RawDirResult> = Vec::with_capacity(16_384);
            let mut is_active = true;

            loop {
                if cancel.load(Ordering::Relaxed) {
                    break;
                }

                if let Some(task) = find_task(&worker, &injector, &my_stealers) {
                    if !is_active {
                        active.fetch_add(1, Ordering::Relaxed);
                        is_active = true;
                    }

                    #[cfg(windows)]
                    {
                        let mut search_pattern = String::with_capacity(task.dir_path.len() + 3);
                        search_pattern.push_str(&task.dir_path);
                        if !task.dir_path.ends_with('\\') {
                            search_pattern.push('\\');
                        }
                        search_pattern.push('*');

                        let wide_pattern = to_wide_null(&search_pattern);
                        let mut find_data: WIN32_FIND_DATAW = unsafe { std::mem::zeroed() };

                        let handle = unsafe {
                            FindFirstFileExW(
                                wide_pattern.as_ptr(),
                                FindExInfoBasic,
                                &mut find_data as *mut _ as *mut _,
                                FindExSearchNameMatch,
                                std::ptr::null(),
                                FIND_FIRST_EX_LARGE_FETCH,
                            )
                        };

                        let mut files = Vec::new();
                        let mut pending_subdirs: Vec<(String, String, u64)> = Vec::new();
                        let mut local_files_added = 0u64;
                        let mut local_bytes_added = 0u64;

                        if handle != INVALID_HANDLE_VALUE {
                            loop {
                                if !is_dot_or_dotdot(&find_data.cFileName) {
                                    let attrs = find_data.dwFileAttributes;
                                    let is_dir = (attrs & FILE_ATTRIBUTE_DIRECTORY) != 0;
                                    let is_reparse = (attrs & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
                                    let mod_time = filetime_to_unix_secs(
                                        find_data.ftLastWriteTime.dwHighDateTime,
                                        find_data.ftLastWriteTime.dwLowDateTime,
                                    );

                                    let name_len = u16_len(&find_data.cFileName);
                                    if let Ok(entry_name) = String::from_utf16(&find_data.cFileName[..name_len]) {
                                        let mut entry_full_path = String::with_capacity(task.dir_path.len() + 1 + entry_name.len());
                                        entry_full_path.push_str(&task.dir_path);
                                        if !task.dir_path.ends_with('\\') {
                                            entry_full_path.push('\\');
                                        }
                                        entry_full_path.push_str(&entry_name);

                                        if is_dir {
                                            if !is_reparse {
                                                pending_subdirs.push((entry_name, entry_full_path, mod_time));
                                            }
                                        } else {
                                            let file_size = ((find_data.nFileSizeHigh as u64) << 32)
                                                | (find_data.nFileSizeLow as u64);
                                            local_files_added += 1;
                                            local_bytes_added += file_size;

                                            let ext = entry_name
                                                .rfind('.')
                                                .and_then(|dot_idx| {
                                                    if dot_idx + 1 < entry_name.len() {
                                                        Some(entry_name[dot_idx + 1..].to_lowercase())
                                                    } else {
                                                        None
                                                    }
                                                });

                                            files.push(RawFileEntry {
                                                name: entry_name,
                                                path: entry_full_path,
                                                size: file_size,
                                                extension: ext,
                                                modified: mod_time,
                                            });
                                        }
                                    }
                                }

                                if unsafe { FindNextFileW(handle, &mut find_data) } == 0 {
                                    break;
                                }
                            }
                            unsafe { FindClose(handle) };
                        }

                        // Reserve contiguous block of child directory IDs atomically
                        let k = pending_subdirs.len();
                        let mut subdir_ids = Vec::with_capacity(k);

                        if k > 0 {
                            let start_id = next_id.fetch_add(k, Ordering::Relaxed);
                            dirs_cnt.fetch_add(k as u64, Ordering::Relaxed);

                            for (i, (sub_name, sub_path, sub_mod)) in pending_subdirs.into_iter().enumerate() {
                                let child_id = start_id + i;
                                subdir_ids.push(child_id);
                                worker.push(WorkTask {
                                    dir_id: child_id,
                                    parent_id: Some(task.dir_id),
                                    dir_path: sub_path,
                                    dir_name: sub_name,
                                    dir_modified: sub_mod,
                                });
                            }
                        }

                        if local_files_added > 0 {
                            files_cnt.fetch_add(local_files_added, Ordering::Relaxed);
                            bytes_cnt.fetch_add(local_bytes_added, Ordering::Relaxed);
                        }

                        local_results.push(RawDirResult {
                            dir_id: task.dir_id,
                            parent_id: task.parent_id,
                            name: task.dir_name,
                            path: task.dir_path.clone(),
                            modified: task.dir_modified,
                            files,
                            subdir_ids,
                        });

                        // Throttle progress events to ~100ms
                        let cur_elapsed = start_time.elapsed().as_millis() as u64;
                        let last = last_prog.load(Ordering::Relaxed);
                        if cur_elapsed > last + 100
                            && last_prog.compare_exchange(last, cur_elapsed, Ordering::Relaxed, Ordering::Relaxed).is_ok()
                        {
                            let _ = app_handle_clone.emit(
                                "scan-progress",
                                ScanProgress {
                                    files_scanned: files_cnt.load(Ordering::Relaxed),
                                    dirs_scanned: dirs_cnt.load(Ordering::Relaxed),
                                    bytes_scanned: bytes_cnt.load(Ordering::Relaxed),
                                    current_path: task.dir_path,
                                    elapsed_ms: cur_elapsed,
                                    is_complete: false,
                                },
                            );
                        }
                    }

                    #[cfg(not(windows))]
                    {
                        // Fallback implementation for non-Windows platforms
                        let _ = task;
                    }
                } else {
                    if is_active {
                        active.fetch_sub(1, Ordering::Relaxed);
                        is_active = false;
                    }

                    if active.load(Ordering::Relaxed) == 0 && injector.is_empty() {
                        let any_work = my_stealers.iter().any(|s| !s.is_empty()) || !worker.is_empty();
                        if !any_work {
                            break;
                        }
                    }

                    thread::yield_now();
                }
            }

            local_results
        }));
    }

    // Join all worker threads and collect directory results
    let mut all_thread_results = Vec::with_capacity(num_threads);
    for h in thread_handles {
        if let Ok(res) = h.join() {
            all_thread_results.push(res);
        }
    }

    if cancel_flag.load(Ordering::Relaxed) {
        return Err("Scan cancelled by user".to_string());
    }

    let total_dirs_count = next_dir_id.load(Ordering::Relaxed);
    println!(
        "[FastScanner] Work-stealing complete in {:.3}s. Discovered {} directories.",
        start_time.elapsed().as_secs_f64(),
        total_dirs_count
    );

    // Assemble directories into contiguous array indexed by dir_id (0..total_dirs_count)
    let mut dir_slots: Vec<Option<RawDirResult>> = (0..total_dirs_count).map(|_| None).collect();
    let mut total_files_count = 0usize;

    for thread_res in all_thread_results {
        for dir_item in thread_res {
            total_files_count += dir_item.files.len();
            let id = dir_item.dir_id;
            if id < dir_slots.len() {
                dir_slots[id] = Some(dir_item);
            }
        }
    }

    let total_nodes_count = total_dirs_count + total_files_count;
    let mut nodes: Vec<FileNode> = Vec::with_capacity(total_nodes_count);

    // Initialize all directory nodes at indices [0..total_dirs_count)
    for (i, slot) in dir_slots.iter().enumerate().take(total_dirs_count) {
        if let Some(ref d) = slot {
            nodes.push(FileNode {
                id: i,
                parent_id: d.parent_id,
                name: d.name.clone(),
                path: d.path.clone(),
                size: 0,
                is_dir: true,
                file_count: 0,
                dir_count: 0,
                children: Vec::new(),
                extension: None,
                modified: d.modified,
            });
        } else {
            // Placeholder for any unreadable / skipped directory
            nodes.push(FileNode {
                id: i,
                parent_id: None,
                name: String::new(),
                path: String::new(),
                size: 0,
                is_dir: true,
                file_count: 0,
                dir_count: 0,
                children: Vec::new(),
                extension: None,
                modified: 0,
            });
        }
    }

    // Populate child files starting at index total_dirs_count
    let mut current_file_id = total_dirs_count;
    let mut extension_map: HashMap<String, (u64, usize)> = HashMap::new();

    for i in 0..total_dirs_count {
        if let Some(d) = dir_slots[i].take() {
            // First add subdirectories as children
            nodes[i].children.extend(d.subdir_ids);

            // Add files as children and push FileNode
            for f in d.files {
                let f_id = current_file_id;
                current_file_id += 1;

                if let Some(ref ext) = f.extension {
                    let stat = extension_map.entry(ext.clone()).or_insert((0, 0));
                    stat.0 += f.size;
                    stat.1 += 1;
                }

                nodes[i].children.push(f_id);
                nodes.push(FileNode {
                    id: f_id,
                    parent_id: Some(i),
                    name: f.name,
                    path: f.path,
                    size: f.size,
                    is_dir: false,
                    file_count: 1,
                    dir_count: 0,
                    children: Vec::new(),
                    extension: f.extension,
                    modified: f.modified,
                });
            }
        }
    }

    // Direct files initialization for each directory
    for i in 0..total_dirs_count {
        let mut direct_size = 0u64;
        let mut direct_files = 0u32;
        for &child_id in &nodes[i].children {
            if !nodes[child_id].is_dir {
                direct_size += nodes[child_id].size;
                direct_files += 1;
            }
        }
        nodes[i].size = direct_size;
        nodes[i].file_count = direct_files;
    }

    // Post-order Bottom-Up Rollup:
    // Because next_dir_id is strictly monotonic, every child directory has child_id > parent_id.
    // Therefore, iterating in reverse order from total_dirs_count - 1 down to 1 guarantees
    // all descendants are completely rolled up before their parent is updated!
    for d in (1..total_dirs_count).rev() {
        let d_size = nodes[d].size;
        let d_files = nodes[d].file_count;
        let d_dirs = nodes[d].dir_count + 1; // Count itself as 1 folder for parent

        if let Some(parent_id) = nodes[d].parent_id {
            if parent_id < total_dirs_count {
                nodes[parent_id].size += d_size;
                nodes[parent_id].file_count += d_files;
                nodes[parent_id].dir_count += d_dirs;
            }
        }
    }

    // Sort children of each directory by child size descending
    for i in 0..total_dirs_count {
        if !nodes[i].children.is_empty() {
            let mut children = std::mem::take(&mut nodes[i].children);
            children.sort_by(|&a, &b| {
                let size_a = nodes[a].size;
                let size_b = nodes[b].size;
                size_b.cmp(&size_a)
            });
            nodes[i].children = children;
        }
    }

    // Extension stats calculation
    let total_bytes = nodes[0].size;
    let mut extension_stats: Vec<ExtensionStat> = extension_map
        .into_iter()
        .map(|(ext, (sz, count))| {
            let (category, color) = get_category_and_color(&ext);
            let pct = if total_bytes > 0 {
                (sz as f64 / total_bytes as f64) * 100.0
            } else {
                0.0
            };
            ExtensionStat {
                extension: ext,
                category: category.to_string(),
                color: color.to_string(),
                total_size: sz,
                file_count: count,
                percentage: pct,
            }
        })
        .collect();

    extension_stats.sort_by_key(|a| std::cmp::Reverse(a.total_size));

    let elapsed_ms = start_time.elapsed().as_millis() as u64;

    // Final progress emit
    let _ = app_handle.emit(
        "scan-progress",
        ScanProgress {
            files_scanned: nodes[0].file_count as u64,
            dirs_scanned: nodes[0].dir_count as u64,
            bytes_scanned: nodes[0].size,
            current_path: target_path.clone(),
            elapsed_ms,
            is_complete: true,
        },
    );

    println!(
        "[FastScanner] Complete! Scanned {} files ({:.2} GB) across {} dirs in {:.3}s",
        nodes[0].file_count,
        (nodes[0].size as f64) / (1024.0 * 1024.0 * 1024.0),
        nodes[0].dir_count,
        start_time.elapsed().as_secs_f64()
    );

    Ok(ScanState {
        total_files: nodes[0].file_count as u64,
        total_dirs: nodes[0].dir_count as u64,
        total_bytes: nodes[0].size,
        nodes,
        root_id: 0,
        extension_stats,
        elapsed_ms,
        root_path: target_path,
    })
}
