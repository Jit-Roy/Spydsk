export type AppMode = 'explorer' | 'quick_clean' | 'dev_clean' | 'duplicates' | 'deep_clean' | 'space_saver';
export type CategoryFilterType = 'All' | 'Images' | 'Videos' | 'Zip' | 'Documents' | 'Others';

export interface DriveInfo {
  mount_point: string;
  volume_name: string;
  fs_type: string;
  total_bytes: number;
  free_bytes: number;
  used_bytes: number;
  percent_used: number;
}

export interface FileNodeDto {
  id: number;
  parent_id: number | null;
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  file_count: number;
  dir_count: number;
  has_children: boolean;
  extension: string | null;
  percentage_of_parent: number;
  modified: number;
}

export interface ExtensionStat {
  extension: string;
  category: string;
  color: string;
  total_size: number;
  file_count: number;
  percentage: number;
}

export interface TreemapRect {
  id: number;
  name: string;
  path: string;
  size: number;
  formatted_size: string;
  is_dir: boolean;
  extension: string | null;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
}

export interface ScanProgress {
  files_scanned: number;
  dirs_scanned: number;
  bytes_scanned: number;
  current_path: string;
  elapsed_ms: number;
  is_complete: boolean;
}

export interface ScanSummary {
  root_id: number;
  total_files: number;
  total_dirs: number;
  total_bytes: number;
  elapsed_ms: number;
  root_path: string;
}

export interface CleanCategoryItem {
  id: string;
  name: string;
  description: string;
  path: string;
  size_bytes: number;
  file_count: number;
  is_selected: boolean;
  is_safe: boolean;
}

export interface CategoryChildItem {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
  file_count: number;
}

export interface QuickCleanResult {
  total_size_bytes: number;
  total_files: number;
  categories: CleanCategoryItem[];
  elapsed_ms: number;
}

export interface DevCleanItem {
  id: string;
  project_name: string;
  artifact_type: string;
  path: string;
  size_bytes: number;
  file_count: number;
  is_selected: boolean;
}

export interface DevCleanResult {
  total_size_bytes: number;
  total_artifacts: number;
  items: DevCleanItem[];
  elapsed_ms: number;
}

export interface DuplicateFileItem {
  path: string;
  size_bytes: number;
  is_selected: boolean;
}

export interface DuplicateGroup {
  id: string;
  file_name: string;
  size_bytes: number;
  wasted_bytes: number;
  files: DuplicateFileItem[];
}

export interface DuplicateFinderResult {
  total_wasted_bytes: number;
  total_duplicate_files: number;
  groups: DuplicateGroup[];
  elapsed_ms: number;
}

export interface SpaceSaverItem {
  id: string;
  name: string;
  path: string;
  is_dir: boolean;
  original_size_bytes: number;
  estimated_compressed_bytes: number;
  estimated_savings_bytes: number;
  compression_ratio_pct: number;
  category: string;
  file_count: number;
  is_selected: boolean;
}

export interface SpaceSaverResult {
  total_original_bytes: number;
  total_estimated_compressed_bytes: number;
  total_estimated_savings_bytes: number;
  total_items: number;
  items: SpaceSaverItem[];
  elapsed_ms: number;
}

export interface SpaceSaverCompressOptions {
  paths: string[];
  mode: 'zip' | 'compact';
  remove_original: boolean;
}

export interface SpaceSaverCompressResult {
  success: boolean;
  processed_count: number;
  original_bytes: number;
  final_bytes: number;
  freed_bytes: number;
  message: string;
}
