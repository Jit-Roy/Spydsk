import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Folder,
  File,
  ArrowUpDown,
  Play,
  Image as ImageIcon,
  FileText,
  Package,
  MoreHorizontal,
  ExternalLink,
  Copy,
  Scissors,
  Clipboard,
  Trash2,
  Info,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  X,
} from 'lucide-react';
import { FileNodeDto, ScanProgress, CategoryFilterType } from '../types';
import { formatBytes, formatDate } from '../utils';

interface MainContentViewProps {
  rootId: number | null;
  isScanning: boolean;
  progress: ScanProgress | null;
  selectedPath: string;
  onStartScan: () => void;
  selectedCategory: CategoryFilterType;
  onSelectCategory: (cat: CategoryFilterType) => void;
  activeView: 'tree' | 'file';
}

interface ExpandedState {
  [nodeId: number]: FileNodeDto[];
}

interface ContextMenuState {
  x: number;
  y: number;
  item: {
    id: number | string;
    name: string;
    path: string;
    is_dir: boolean;
    size: number;
  };
}

type SortField = 'name' | 'size' | 'percentage' | 'files' | 'folders' | 'modified';

export const MainContentView: React.FC<MainContentViewProps> = ({
  rootId,
  isScanning,
  progress,
  selectedPath,
  onStartScan,
  selectedCategory,
  onSelectCategory,
  activeView,
}) => {
  const [rootNodes, setRootNodes] = useState<FileNodeDto[]>([]);
  const [expanded, setExpanded] = useState<{ [id: number]: boolean }>({});
  const [expandedFileStacks, setExpandedFileStacks] = useState<{ [nodeId: number]: boolean }>({});
  const [childrenMap, setChildrenMap] = useState<ExpandedState>({});
  const [sortField, setSortField] = useState<SortField>('size');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Selection & Clipboard state
  const [selectedPathState, setSelectedPathState] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<FileNodeDto | null>(null);
  const [clipboardAction, setClipboardAction] = useState<{
    type: 'copy' | 'cut';
    path: string;
  } | null>(null);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Filter dropdown state
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Flat files state (for File View and Category filters)
  const [flatFiles, setFlatFiles] = useState<FileNodeDto[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);

  // Search filter state beside "All" button
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Close context menu & dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global Keyboard Shortcuts (Ctrl+C, Ctrl+X, Ctrl+V, Delete, Enter, Alt+Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedNode) return;

      if (e.ctrlKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy(selectedNode.path);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        handleCut(selectedNode.path);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePaste(selectedNode.is_dir ? selectedNode.path : selectedPath);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        handleDelete(selectedNode);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.altKey) {
          handleProperties(selectedNode.path);
        } else {
          handleOpen(selectedNode.path);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, clipboardAction, selectedPath]);

  // Load root children for Tree View (re-loads when rootId or selectedCategory changes)
  useEffect(() => {
    if (rootId !== null) {
      setExpanded({});
      setExpandedFileStacks({});
      setChildrenMap({});
      loadChildren(rootId, true);
    } else {
      setRootNodes([]);
      setExpanded({});
      setExpandedFileStacks({});
      setChildrenMap({});
      setFlatFiles([]);
      setSelectedPathState(null);
      setSelectedNode(null);
    }
  }, [rootId, selectedCategory]);

  // Flat files mode is ONLY active when user explicitly chooses File View
  const isFlatFilesMode = activeView === 'file';

  useEffect(() => {
    if (rootId === null || !isFlatFilesMode) {
      return;
    }

    const fetchFiles = async () => {
      setLoadingFiles(true);
      try {
        const catParam =
          selectedCategory !== 'All' ? selectedCategory.toLowerCase() : undefined;

        const results: FileNodeDto[] = await invoke('get_files_by_filter', {
          category: catParam,
          limit: 2000,
        });
        setFlatFiles(results);
      } catch (err) {
        console.error('Failed to query files across drive:', err);
      } finally {
        setLoadingFiles(false);
      }
    };

    fetchFiles();
  }, [selectedCategory, activeView, rootId, isFlatFilesMode]);

  const loadChildren = async (nodeId: number, isRoot = false) => {
    try {
      const catParam =
        selectedCategory !== 'All' ? selectedCategory.toLowerCase() : undefined;

      const nodes: FileNodeDto[] = await invoke('get_node_children', {
        parentId: nodeId,
        category: catParam,
      });
      if (isRoot) {
        setRootNodes(nodes);
      } else {
        setChildrenMap((prev) => ({ ...prev, [nodeId]: nodes }));
      }
    } catch (err) {
      console.error('Failed to load children for node', nodeId, err);
    }
  };

  const toggleExpandFolder = async (node: FileNodeDto, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!node.is_dir) return;

    const isCurrentlyExpanded = !!expanded[node.id];
    if (isCurrentlyExpanded) {
      setExpanded((prev) => ({ ...prev, [node.id]: false }));
    } else {
      setExpanded((prev) => ({ ...prev, [node.id]: true }));
      if (!childrenMap[node.id]) {
        await loadChildren(node.id);
      }
    }
  };

  const toggleExpandFileStack = (parentId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFileStacks((prev) => ({
      ...prev,
      [parentId]: !prev[parentId],
    }));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // default descending for sizes
    }
  };

  const sortNodes = (nodes: FileNodeDto[]): FileNodeDto[] => {
    return [...nodes].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'size':
          cmp = a.size - b.size;
          break;
        case 'percentage':
          cmp = a.percentage_of_parent - b.percentage_of_parent;
          break;
        case 'files':
          cmp = a.file_count - b.file_count;
          break;
        case 'folders':
          cmp = a.dir_count - b.dir_count;
          break;
        case 'modified':
          cmp = a.modified - b.modified;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  };

  // Context Menu Actions
  const handleOpen = async (path: string) => {
    setContextMenu(null);
    try {
      await invoke('open_file', { path });
    } catch (err) {
      console.error('Failed to open:', err);
    }
  };

  const handleCut = (path: string) => {
    setContextMenu(null);
    setClipboardAction({ type: 'cut', path });
    navigator.clipboard.writeText(path);
  };

  const handleCopy = (path: string) => {
    setContextMenu(null);
    setClipboardAction({ type: 'copy', path });
    navigator.clipboard.writeText(path);
  };

  const handlePaste = async (destFolder: string) => {
    setContextMenu(null);
    if (!clipboardAction) return;

    try {
      await invoke('paste_file', {
        source: clipboardAction.path,
        destinationFolder: destFolder,
        isCut: clipboardAction.type === 'cut',
      });
      setClipboardAction(null);
    } catch (err) {
      console.error('Failed to paste:', err);
    }
  };

  const handleDelete = async (item: { id: number | string; path: string }) => {
    setContextMenu(null);
    try {
      await invoke('delete_to_trash', { path: item.path });
      // Remove from flat files
      setFlatFiles((prev) => prev.filter((f) => f.path !== item.path));
      // Remove from rootNodes
      setRootNodes((prev) => prev.filter((f) => f.path !== item.path));
      // Remove from children map
      setChildrenMap((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          const numKey = Number(key);
          next[numKey] = next[numKey].filter((f) => f.path !== item.path);
        }
        return next;
      });
      if (selectedPathState === item.path) {
        setSelectedPathState(null);
        setSelectedNode(null);
      }
    } catch (err) {
      console.error('Failed to delete to trash:', err);
    }
  };

  const handleProperties = async (path: string) => {
    setContextMenu(null);
    try {
      await invoke('show_file_properties', { path });
    } catch (err) {
      console.error('Failed to open properties:', err);
    }
  };

  const handleRowClick = (node: FileNodeDto, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPathState(node.path);
    setSelectedNode(node);
  };

  const handleRowContextMenu = (
    e: React.MouseEvent,
    node: { id: number | string; name: string; path: string; is_dir: boolean; size: number }
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPathState(node.path);
    setSelectedNode(node as FileNodeDto);

    const menuWidth = 190;
    const menuHeight = 240;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);

    setContextMenu({
      x: Math.max(8, x),
      y: Math.max(8, y),
      item: node,
    });
  };

  // WizTree File Stack Tree View Renderer
  const renderTreeRows = (
    nodes: FileNodeDto[],
    depth = 0,
    parentPath = selectedPath,
    parentSize = 1
  ): React.ReactNode => {
    const subdirs = sortNodes(nodes.filter((n) => n.is_dir));
    const directFiles = sortNodes(nodes.filter((n) => !n.is_dir));

    const totalFilesSize = directFiles.reduce((acc, f) => acc + f.size, 0);
    const filesPercentage = parentSize > 0 ? (totalFilesSize / parentSize) * 100 : 0;
    const parentId = nodes.length > 0 && nodes[0].parent_id !== null ? nodes[0].parent_id : 0;
    const isStackExp = !!expandedFileStacks[parentId];

    return (
      <React.Fragment key={`group_${parentId}_${depth}`}>
        {/* 1. File Stack Row: [X Files in <Folder>] if direct files exist */}
        {directFiles.length > 0 && (
          <>
            <tr
              className={`data-row file-stack-row ${
                selectedPathState === `stack_${parentId}` ? 'selected-row' : ''
              }`}
              style={{ paddingLeft: `${depth * 20 + 8}px` }}
              onClick={() => {
                setSelectedPathState(`stack_${parentId}`);
              }}
            >
              <td className="col-name" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
                <div className="name-cell">
                  {/* Chevron Arrow Toggle */}
                  <button
                    className="chevron-btn"
                    onClick={(e) => toggleExpandFileStack(parentId, e)}
                    title={isStackExp ? 'Collapse files' : 'Expand files'}
                  >
                    {isStackExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <span className="file-stack-name">
                    [{directFiles.length} Files in {parentPath}]
                  </span>
                </div>
              </td>

              <td className="col-size">{formatBytes(totalFilesSize)}</td>

              <td className="col-pct">
                <div className="pct-cell">
                  <span className="pct-number">{filesPercentage.toFixed(1)}%</span>
                  <div className="pct-pill-track">
                    <div
                      className="pct-pill-fill"
                      style={{ width: `${Math.min(filesPercentage, 100)}%` }}
                    />
                  </div>
                </div>
              </td>

              <td className="col-files">{directFiles.length.toLocaleString()}</td>
              <td className="col-folders">-</td>
              <td className="col-modified">-</td>
            </tr>

            {/* Individual Files inside the File Stack when expanded */}
            {isStackExp &&
              directFiles.map((file) => {
                const isSelected = selectedPathState === file.path;

                return (
                  <tr
                    key={file.id}
                    className={`data-row file-in-stack-row ${isSelected ? 'selected-row' : ''}`}
                    onClick={(e) => handleRowClick(file, e)}
                    onContextMenu={(e) => handleRowContextMenu(e, file)}
                    onDoubleClick={() => handleOpen(file.path)}
                  >
                    <td
                      className="col-name"
                      style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}
                    >
                      <div className="name-cell">
                        <span className="chevron-spacer" />
                        <File size={15} className="file-icon" />
                        <span className="name-text" title={file.path}>
                          {file.name}
                        </span>
                      </div>
                    </td>

                    <td className="col-size">{formatBytes(file.size)}</td>

                    <td className="col-pct">
                      <div className="pct-cell">
                        <span className="pct-number">
                          {file.percentage_of_parent.toFixed(1)}%
                        </span>
                        <div className="pct-pill-track">
                          <div
                            className="pct-pill-fill"
                            style={{
                              width: `${Math.min(file.percentage_of_parent, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="col-files">-</td>
                    <td className="col-folders">-</td>
                    <td className="col-modified">{formatDate(file.modified)}</td>
                  </tr>
                );
              })}
          </>
        )}

        {/* 2. Subdirectories in the folder */}
        {subdirs.map((dir) => {
          const isExp = !!expanded[dir.id];
          const children = childrenMap[dir.id] || [];
          const isSelected = selectedPathState === dir.path;

          return (
            <React.Fragment key={dir.id}>
              <tr
                className={`data-row dir-row ${isSelected ? 'selected-row' : ''}`}
                onClick={(e) => handleRowClick(dir, e)}
                onContextMenu={(e) => handleRowContextMenu(e, dir)}
                onDoubleClick={(e) => toggleExpandFolder(dir, e)}
              >
                <td className="col-name" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
                  <div className="name-cell">
                    {/* Chevron Arrow Toggle */}
                    <button
                      className="chevron-btn"
                      onClick={(e) => toggleExpandFolder(dir, e)}
                    >
                      {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    <Folder size={16} className="folder-icon" />

                    <span className="name-text font-medium" title={dir.path}>
                      {dir.name}
                    </span>
                  </div>
                </td>

                <td className="col-size">{formatBytes(dir.size)}</td>

                <td className="col-pct">
                  <div className="pct-cell">
                    <span className="pct-number">
                      {dir.percentage_of_parent.toFixed(1)}%
                    </span>
                    <div className="pct-pill-track">
                      <div
                        className="pct-pill-fill"
                        style={{
                          width: `${Math.min(dir.percentage_of_parent, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </td>

                <td className="col-files">{dir.file_count.toLocaleString()}</td>
                <td className="col-folders">{dir.dir_count.toLocaleString()}</td>
                <td className="col-modified">{formatDate(dir.modified)}</td>
              </tr>

              {/* Recursive Child Rows when folder expanded */}
              {isExp &&
                children.length > 0 &&
                renderTreeRows(children, depth + 1, dir.path, dir.size)}
            </React.Fragment>
          );
        })}
      </React.Fragment>
    );
  };

  // Category Dropdown options
  const categoryOptions: {
    key: CategoryFilterType;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { key: 'All', label: 'All', icon: <FolderOpen size={14} /> },
    { key: 'Images', label: 'Images', icon: <ImageIcon size={14} /> },
    { key: 'Videos', label: 'Videos', icon: <Play size={14} fill="currentColor" /> },
    { key: 'Zip', label: 'Zip', icon: <Package size={14} /> },
    { key: 'Documents', label: 'Documents', icon: <FileText size={14} /> },
    { key: 'Others', label: 'Others', icon: <MoreHorizontal size={14} /> },
  ];

  const currentCategoryOpt =
    categoryOptions.find((opt) => opt.key === selectedCategory) || categoryOptions[0];

  const maxFilteredSize = flatFiles.length > 0 ? flatFiles[0].size : 1;
  const sortedFlatFiles = sortNodes(flatFiles);

  const displayedFlatFiles = searchFilter.trim()
    ? sortedFlatFiles.filter((f) =>
        f.name.toLowerCase().includes(searchFilter.trim().toLowerCase())
      )
    : sortedFlatFiles;

  const displayedTreeNodes = searchFilter.trim()
    ? rootNodes.filter((n) =>
        n.name.toLowerCase().includes(searchFilter.trim().toLowerCase())
      )
    : rootNodes;

  return (
    <div
      className="main-content-panel"
      onContextMenu={(e) => {
        // Prevent default browser menu anywhere in the panel
        e.preventDefault();
      }}
    >
      {/* Top Header Controls: Filter Dropdown on left, View Toggle on right */}
      <div className="content-toolbar">
        {/* Left Side: Filter Dropdown & Search Bar */}
        <div className="toolbar-left-group">
          <div className="filter-dropdown-wrapper" ref={dropdownRef}>
            <button
              className="filter-dropdown-btn"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              title="Filter files by type"
            >
              <div className="filter-dropdown-label-group">
                <span className="filter-dropdown-icon">{currentCategoryOpt.icon}</span>
                <span className="filter-dropdown-text">{currentCategoryOpt.label}</span>
              </div>
              <span className={`filter-dropdown-chevron ${dropdownOpen ? 'rotate' : ''}`}>
                <ChevronDown size={13} />
              </span>
            </button>

            {dropdownOpen && (
              <div className="filter-dropdown-menu">
                {categoryOptions.map((opt) => (
                  <div
                    key={opt.key}
                    className={`filter-dropdown-item ${
                      selectedCategory === opt.key ? 'active' : ''
                    }`}
                    onClick={() => {
                      onSelectCategory(opt.key);
                      setDropdownOpen(false);
                    }}
                  >
                    <span className="dropdown-item-icon">{opt.icon}</span>
                    <span className="dropdown-item-text">{opt.label}</span>
                    {selectedCategory === opt.key && (
                      <span className="dropdown-item-active-dot" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search Input beside "All" button - only visible once search is clicked/active */}
          {(rootId !== null || isScanning) && (
            <div className="toolbar-search-box">
              <Search size={14} className="toolbar-search-icon" />
              <input
                type="text"
                className="toolbar-search-input"
                placeholder="Search files..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
              {searchFilter && (
                <button
                  type="button"
                  className="toolbar-search-clear"
                  onClick={() => setSearchFilter('')}
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Workspace: Logo Pre-Scan / Scanning View / Table */}
      {rootId === null && !isScanning ? (
        <div className="standby-hero-container">
          <div className="standby-hero-box">
            <svg
              className="disk-search-svg"
              width="120"
              height="96"
              viewBox="0 0 120 96"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Hard drive body */}
              <rect
                x="14"
                y="18"
                width="72"
                height="46"
                rx="8"
                stroke="#ffffff"
                strokeWidth="3.2"
              />
              {/* Drive tray slot line */}
              <line
                x1="14"
                y1="48"
                x2="58"
                y2="48"
                stroke="#ffffff"
                strokeWidth="3.2"
              />
              {/* Drive LED circle */}
              <circle
                cx="26"
                cy="54"
                r="2.5"
                fill="#ffffff"
              />
              {/* Magnifying Glass overlapping bottom-right */}
              <circle
                cx="74"
                cy="50"
                r="17"
                stroke="#ffffff"
                strokeWidth="3.5"
              />
              <line
                x1="86"
                y1="62"
                x2="104"
                y2="80"
                stroke="#ffffff"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
            <h2 className="standby-hero-title">Search Your Disk</h2>
            <p className="standby-hero-desc">
              Click the button below to start searching for files.
            </p>
            <button
              type="button"
              className="canvas-hero-btn-filled"
              onClick={onStartScan}
            >
              <Search size={16} />
              <span>Search</span>
            </button>
          </div>
        </div>
      ) : isScanning ? (
        <div className="scanning-splash">
          <div className="scanning-pulse-circle">
            <span className="scanning-pulse-glyph">⬡</span>
          </div>
          <h2 className="scanning-title">
            Scanning Drive {selectedPath.replace('\\', '')}...
          </h2>
          <p className="scanning-details">
            {progress
              ? `${progress.files_scanned.toLocaleString()} files • ${(
                  progress.bytes_scanned /
                  (1024 ** 3)
                ).toFixed(1)} GB scanned`
              : 'Streaming Master File Table across 16 threads...'}
          </p>
          {progress?.current_path && (
            <p className="scanning-current-path" title={progress.current_path}>
              {progress.current_path}
            </p>
          )}
        </div>
      ) : isFlatFilesMode ? (
        /* Flat Files Results Table (File View OR specific Category filter) */
        <div className="table-scroll-container">
          <table className="fluent-table file-table">
            <thead>
              <tr>
                <th className="th-col th-name" onClick={() => handleSort('name')}>
                  <div className="th-content">
                    <span>File Name</span>
                    <ArrowUpDown size={12} className="sort-icon" />
                  </div>
                </th>
                <th className="th-col th-path">Folder Path</th>
                <th className="th-col th-size" onClick={() => handleSort('size')}>
                  <div className="th-content">
                    <span>Size</span>
                    <ArrowUpDown size={12} className="sort-icon" />
                  </div>
                </th>
                <th className="th-col th-pct" onClick={() => handleSort('percentage')}>
                  <div className="th-content">
                    <span>Volume %</span>
                    <ArrowUpDown size={12} className="sort-icon" />
                  </div>
                </th>
                <th className="th-col th-modified" onClick={() => handleSort('modified')}>
                  <div className="th-content">
                    <span>Modified</span>
                    <ArrowUpDown size={12} className="sort-icon" />
                  </div>
                </th>
                <th className="th-col th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingFiles ? (
                <tr>
                  <td colSpan={6} className="empty-table-msg">
                    Loading files across entire drive...
                  </td>
                </tr>
              ) : displayedFlatFiles.length > 0 ? (
                displayedFlatFiles.map((file) => {
                  const pct = Math.max(2, (file.size / maxFilteredSize) * 100);
                  const folderPath =
                    file.path.substring(0, file.path.lastIndexOf('\\') + 1) || file.path;
                  const isSelected = selectedPathState === file.path;

                  return (
                    <tr
                      key={file.id}
                      className={`data-row filtered-file-row ${
                        isSelected ? 'selected-row' : ''
                      }`}
                      onClick={(e) => handleRowClick(file, e)}
                      onContextMenu={(e) => handleRowContextMenu(e, file)}
                      onDoubleClick={() => handleOpen(file.path)}
                    >
                      <td className="col-name" style={{ paddingLeft: '16px' }}>
                        <div className="name-cell">
                          <File size={16} className="file-icon" />
                          <span className="name-text" title={file.name}>
                            {file.name}
                          </span>
                        </div>
                      </td>

                      <td className="col-path" title={folderPath}>
                        <span className="dimmed-path">{folderPath}</span>
                      </td>

                      <td className="col-size">{formatBytes(file.size)}</td>

                      <td className="col-pct">
                        <div className="pct-cell">
                          <span className="pct-number">
                            {file.percentage_of_parent.toFixed(2)}%
                          </span>
                          <div className="pct-pill-track">
                            <div
                              className="pct-pill-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="col-modified">{formatDate(file.modified)}</td>

                      <td className="col-actions">
                        <div className="row-actions-group">
                          <button
                            className="row-action-btn"
                            title="Open file"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpen(file.path);
                            }}
                          >
                            <ExternalLink size={13} />
                          </button>
                          <button
                            className="row-action-btn"
                            title="Open containing folder"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpen(folderPath);
                            }}
                          >
                            <FolderOpen size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="empty-table-msg">
                    No files found{selectedCategory !== 'All' ? ` in ${selectedCategory}` : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Hierarchical Tree View with WizTree File Stacking */
        <div className="table-scroll-container">
          <table className="fluent-table tree-table">
            <thead>
              <tr>
                <th className="th-col th-name" onClick={() => handleSort('name')}>
                  <div className="th-content">
                    <span>Name</span>
                    <ArrowUpDown size={12} className="sort-icon" />
                  </div>
                </th>
                <th className="th-col th-size" onClick={() => handleSort('size')}>
                  Size
                </th>
                <th className="th-col th-pct" onClick={() => handleSort('percentage')}>
                  % Parent
                </th>
                <th className="th-col th-files" onClick={() => handleSort('files')}>
                  Files
                </th>
                <th className="th-col th-folders" onClick={() => handleSort('folders')}>
                  Folders
                </th>
                <th className="th-col th-modified" onClick={() => handleSort('modified')}>
                  Modified
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedTreeNodes.length > 0 ? (
                renderTreeRows(displayedTreeNodes, 0, selectedPath, rootNodes.reduce((a, b) => a + b.size, 0))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-table-msg">
                    No items found on {selectedPath}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Custom Windows 11 Fluent Dark Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fluent-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
        >
          <div
            className="ctx-menu-item"
            onClick={() => handleOpen(contextMenu.item.path)}
          >
            <div className="ctx-item-left">
              <ExternalLink size={14} className="ctx-icon" />
              <span>Open</span>
            </div>
            <span className="ctx-shortcut">Enter</span>
          </div>

          <div className="ctx-menu-divider" />

          <div
            className="ctx-menu-item"
            onClick={() => handleCut(contextMenu.item.path)}
          >
            <div className="ctx-item-left">
              <Scissors size={14} className="ctx-icon" />
              <span>Cut</span>
            </div>
            <span className="ctx-shortcut">Ctrl+X</span>
          </div>

          <div
            className="ctx-menu-item"
            onClick={() => handleCopy(contextMenu.item.path)}
          >
            <div className="ctx-item-left">
              <Copy size={14} className="ctx-icon" />
              <span>Copy</span>
            </div>
            <span className="ctx-shortcut">Ctrl+C</span>
          </div>

          <div
            className={`ctx-menu-item ${!clipboardAction ? 'disabled' : ''}`}
            onClick={() => {
              if (clipboardAction) {
                handlePaste(
                  contextMenu.item.is_dir ? contextMenu.item.path : selectedPath
                );
              }
            }}
          >
            <div className="ctx-item-left">
              <Clipboard size={14} className="ctx-icon" />
              <span>Paste</span>
            </div>
            <span className="ctx-shortcut">Ctrl+V</span>
          </div>

          <div className="ctx-menu-divider" />

          <div
            className="ctx-menu-item ctx-danger"
            onClick={() => handleDelete(contextMenu.item)}
          >
            <div className="ctx-item-left">
              <Trash2 size={14} className="ctx-icon danger-icon" />
              <span>Delete</span>
            </div>
            <span className="ctx-shortcut">Del</span>
          </div>

          <div className="ctx-menu-divider" />

          <div
            className="ctx-menu-item"
            onClick={() => handleProperties(contextMenu.item.path)}
          >
            <div className="ctx-item-left">
              <Info size={14} className="ctx-icon" />
              <span>Properties</span>
            </div>
            <span className="ctx-shortcut">Alt+Enter</span>
          </div>
        </div>
      )}
    </div>
  );
};
