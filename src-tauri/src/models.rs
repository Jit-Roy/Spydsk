use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveInfo {
    pub mount_point: String,
    pub volume_name: String,
    pub fs_type: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub used_bytes: u64,
    pub percent_used: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub id: usize,
    pub parent_id: Option<usize>,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub file_count: u32,
    pub dir_count: u32,
    pub children: Vec<usize>,
    pub extension: Option<String>,
    pub modified: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNodeDto {
    pub id: usize,
    pub parent_id: Option<usize>,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub file_count: u32,
    pub dir_count: u32,
    pub has_children: bool,
    pub extension: Option<String>,
    pub percentage_of_parent: f64,
    pub modified: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionStat {
    pub extension: String,
    pub category: String,
    pub color: String,
    pub total_size: u64,
    pub file_count: usize,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TreemapRect {
    pub id: usize,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub formatted_size: String,
    pub is_dir: bool,
    pub extension: Option<String>,
    pub color: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub depth: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanCategoryItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub size_bytes: u64,
    pub file_count: usize,
    pub is_selected: bool,
    pub is_safe: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickCleanResult {
    pub total_size_bytes: u64,
    pub total_files: usize,
    pub categories: Vec<CleanCategoryItem>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub files_scanned: u64,
    pub dirs_scanned: u64,
    pub bytes_scanned: u64,
    pub current_path: String,
    pub elapsed_ms: u64,
    pub is_complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanSummary {
    pub root_id: usize,
    pub total_files: u64,
    pub total_dirs: u64,
    pub total_bytes: u64,
    pub elapsed_ms: u64,
    pub root_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevCleanItem {
    pub id: String,
    pub project_name: String,
    pub artifact_type: String,
    pub path: String,
    pub size_bytes: u64,
    pub file_count: usize,
    pub is_selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevCleanResult {
    pub total_size_bytes: u64,
    pub total_artifacts: usize,
    pub items: Vec<DevCleanItem>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateFileItem {
    pub path: String,
    pub size_bytes: u64,
    pub is_selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub id: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub wasted_bytes: u64,
    pub files: Vec<DuplicateFileItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateFinderResult {
    pub total_wasted_bytes: u64,
    pub total_duplicate_files: usize,
    pub groups: Vec<DuplicateGroup>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryChildItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceSaverItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub original_size_bytes: u64,
    pub estimated_compressed_bytes: u64,
    pub estimated_savings_bytes: u64,
    pub compression_ratio_pct: u32,
    pub category: String,
    pub file_count: usize,
    pub is_selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceSaverResult {
    pub total_original_bytes: u64,
    pub total_estimated_compressed_bytes: u64,
    pub total_estimated_savings_bytes: u64,
    pub total_items: usize,
    pub items: Vec<SpaceSaverItem>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceSaverCompressOptions {
    pub paths: Vec<String>,
    pub mode: String,
    pub remove_original: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpaceSaverCompressResult {
    pub success: bool,
    pub processed_count: usize,
    pub original_bytes: u64,
    pub final_bytes: u64,
    pub freed_bytes: u64,
    pub message: String,
}
