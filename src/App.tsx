import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Sparkles,
  Terminal,
  Copy,
  Trash2,
  Archive,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Folder,
  File,
} from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { StorageSidebar } from './components/StorageSidebar';
import { RightSidebar } from './components/RightSidebar';
import { MainContentView } from './components/MainContentView';
import {
  DriveInfo,
  ScanProgress,
  ScanSummary,
  AppMode,
  CategoryFilterType,
  QuickCleanResult,
  DevCleanResult,
  DuplicateFinderResult,
  CategoryChildItem,
  SpaceSaverResult,
  SpaceSaverCompressOptions,
  SpaceSaverCompressResult,
} from './types';
import { formatBytes } from './utils';
import './App.css';

export const App: React.FC = () => {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('C:\\');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilterType>('All');
  const [activeMode, setActiveMode] = useState<AppMode>('explorer');
  const [activeView, setActiveView] = useState<'tree' | 'file'>('tree');

  // Quick Clean state
  const [quickCleanResult, setQuickCleanResult] = useState<QuickCleanResult | null>(null);
  const [selectedCleanCategories, setSelectedCleanCategories] = useState<{ [id: string]: boolean }>({});
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [purgeSuccessMsg, setPurgeSuccessMsg] = useState<string | null>(null);

  // Deep Clean state
  const [deepCleanResult, setDeepCleanResult] = useState<QuickCleanResult | null>(null);
  const [selectedDeepCleanCategories, setSelectedDeepCleanCategories] = useState<{ [id: string]: boolean }>({});
  const [isDeepPurging, setIsDeepPurging] = useState<boolean>(false);
  const [deepPurgeSuccessMsg, setDeepPurgeSuccessMsg] = useState<string | null>(null);

  // Dev Cleaner state
  const [devCleanResult, setDevCleanResult] = useState<DevCleanResult | null>(null);
  const [selectedDevItems, setSelectedDevItems] = useState<{ [path: string]: boolean }>({});
  const [isDevPurging, setIsDevPurging] = useState<boolean>(false);
  const [devPurgeSuccessMsg, setDevPurgeSuccessMsg] = useState<string | null>(null);

  // Duplicate Finder state
  const [duplicateResult, setDuplicateResult] = useState<DuplicateFinderResult | null>(null);
  const [selectedDuplicateFiles, setSelectedDuplicateFiles] = useState<{ [path: string]: boolean }>({});
  const [isDupPurging, setIsDupPurging] = useState<boolean>(false);
  const [dupPurgeSuccessMsg, setDupPurgeSuccessMsg] = useState<string | null>(null);
  const [collapsedDupGroups, setCollapsedDupGroups] = useState<{ [groupId: string]: boolean }>({});

  // Space Saver & Compression state
  const [spaceSaverResult, setSpaceSaverResult] = useState<SpaceSaverResult | null>(null);
  const [selectedSpaceSaverItems, setSelectedSpaceSaverItems] = useState<{ [id: string]: boolean }>({});
  const [spaceSaverMode, setSpaceSaverMode] = useState<'zip' | 'compact'>('zip');
  const [spaceSaverRemoveOriginal, setSpaceSaverRemoveOriginal] = useState<boolean>(true);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [compressSuccessMsg, setCompressSuccessMsg] = useState<string | null>(null);

  // Granular Category Child & Expansion state across cleaning views
  const [expandedCategories, setExpandedCategories] = useState<{ [id: string]: boolean }>({});
  const [categoryChildren, setCategoryChildren] = useState<{ [id: string]: CategoryChildItem[] }>({});
  const [loadingChildren, setLoadingChildren] = useState<{ [id: string]: boolean }>({});
  const [selectedChildPaths, setSelectedChildPaths] = useState<{ [path: string]: boolean }>({});
  const [excludedChildPaths, setExcludedChildPaths] = useState<{ [path: string]: boolean }>({});

  // Load drives on mount without auto-scanning
  useEffect(() => {
    const initApp = async () => {
      try {
        const detectedDrives: DriveInfo[] = await invoke('get_drives');
        setDrives(detectedDrives);

        if (detectedDrives.length > 0) {
          setSelectedPath(detectedDrives[0].mount_point);
        }
      } catch (err) {
        console.error('Failed to init drives', err);
      }
    };

    initApp();

    const unlistenPromise = listen<ScanProgress>('scan-progress', (event) => {
      setProgress(event.payload);
      if (event.payload.is_complete) {
        setIsScanning(false);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Mode-Aware Scanning Trigger
  const handleStartScan = useCallback(async () => {
    if (isScanning) return;

    // Reset granular child expansion and selections on new scan
    setExpandedCategories({});
    setCategoryChildren({});
    setLoadingChildren({});
    setSelectedChildPaths({});
    setExcludedChildPaths({});

    if (activeMode === 'explorer') {
      setIsScanning(true);
      setProgress(null);
      setSummary(null);
      setSelectedCategory('All');

      try {
        const result: ScanSummary = await invoke('start_scan', { path: selectedPath });
        setSummary(result);
      } catch (err) {
        console.error('Scan error:', err);
      } finally {
        setIsScanning(false);
      }
    } else if (activeMode === 'quick_clean') {
      setIsScanning(true);
      setPurgeSuccessMsg(null);
      try {
        const result: QuickCleanResult = await invoke('quick_clean_scan', { drive: selectedPath });
        setQuickCleanResult(result);
        setSelectedCleanCategories({});
      } catch (err) {
        console.error('Quick clean scan error:', err);
      } finally {
        setIsScanning(false);
      }
    } else if (activeMode === 'deep_clean') {
      setIsScanning(true);
      setDeepPurgeSuccessMsg(null);
      try {
        const result: QuickCleanResult = await invoke('deep_clean_scan', { drive: selectedPath });
        setDeepCleanResult(result);
        setSelectedDeepCleanCategories({});
      } catch (err) {
        console.error('Deep clean scan error:', err);
      } finally {
        setIsScanning(false);
      }
    } else if (activeMode === 'dev_clean') {
      setIsScanning(true);
      setDevPurgeSuccessMsg(null);
      try {
        const result: DevCleanResult = await invoke('dev_clean_scan', { drive: selectedPath });
        setDevCleanResult(result);
        setSelectedDevItems({});
      } catch (err) {
        console.error('Dev clean scan error:', err);
      } finally {
        setIsScanning(false);
      }
    } else if (activeMode === 'duplicates') {
      setIsScanning(true);
      setDupPurgeSuccessMsg(null);
      try {
        const result: DuplicateFinderResult = await invoke('duplicate_scan', { drive: selectedPath });
        setDuplicateResult(result);
        setSelectedDuplicateFiles({});
      } catch (err) {
        console.error('Duplicate scan error:', err);
      } finally {
        setIsScanning(false);
      }
    } else if (activeMode === 'space_saver') {
      setIsScanning(true);
      setCompressSuccessMsg(null);
      try {
        const result: SpaceSaverResult = await invoke('space_saver_scan', { drive: selectedPath });
        setSpaceSaverResult(result);
        const initialSelected: { [id: string]: boolean } = {};
        result.items.forEach((item) => {
          initialSelected[item.id] = true;
        });
        setSelectedSpaceSaverItems(initialSelected);
      } catch (err) {
        console.error('Space saver scan error:', err);
      } finally {
        setIsScanning(false);
      }
    }
  }, [isScanning, selectedPath, activeMode]);

  // Expand/collapse category to view child files/subfolders
  const toggleExpandCategory = async (key: string, path: string) => {
    const nextState = !expandedCategories[key];
    setExpandedCategories((prev) => ({ ...prev, [key]: nextState }));
    if (nextState && !categoryChildren[key] && path) {
      setLoadingChildren((prev) => ({ ...prev, [key]: true }));
      try {
        const children: CategoryChildItem[] = await invoke('list_category_children', { path });
        setCategoryChildren((prev) => ({ ...prev, [key]: children }));
      } catch (err) {
        console.error('Failed to list children for', path, err);
        setCategoryChildren((prev) => ({ ...prev, [key]: [] }));
      } finally {
        setLoadingChildren((prev) => ({ ...prev, [key]: false }));
      }
    }
  };

  // Toggle selection for Quick Clean category
  const toggleQuickCleanCategory = (catId: string, sizeBytes: number) => {
    if (sizeBytes === 0) return;
    const isCurrentlySelected = !!selectedCleanCategories[catId];
    setSelectedCleanCategories((prev) => ({ ...prev, [catId]: !isCurrentlySelected }));

    // Reset granular child overrides for this category
    const children = categoryChildren[catId] || [];
    if (children.length > 0) {
      setExcludedChildPaths((prev) => {
        const next = { ...prev };
        children.forEach((c) => delete next[c.path]);
        return next;
      });
      setSelectedChildPaths((prev) => {
        const next = { ...prev };
        children.forEach((c) => delete next[c.path]);
        return next;
      });
    }
  };

  // Toggle selection for child inside Quick Clean category
  const toggleQuickCleanChild = (catId: string, child: CategoryChildItem) => {
    const isParentSelected = !!selectedCleanCategories[catId];
    if (isParentSelected) {
      setExcludedChildPaths((prev) => ({
        ...prev,
        [child.path]: !prev[child.path],
      }));
    } else {
      setSelectedChildPaths((prev) => ({
        ...prev,
        [child.path]: !prev[child.path],
      }));
    }
  };

  // Toggle selection for Deep Clean category
  const toggleDeepCleanCategory = (catId: string, sizeBytes: number) => {
    if (sizeBytes === 0) return;
    const isCurrentlySelected = !!selectedDeepCleanCategories[catId];
    setSelectedDeepCleanCategories((prev) => ({ ...prev, [catId]: !isCurrentlySelected }));

    const children = categoryChildren[catId] || [];
    if (children.length > 0) {
      setExcludedChildPaths((prev) => {
        const next = { ...prev };
        children.forEach((c) => delete next[c.path]);
        return next;
      });
      setSelectedChildPaths((prev) => {
        const next = { ...prev };
        children.forEach((c) => delete next[c.path]);
        return next;
      });
    }
  };

  // Toggle selection for child inside Deep Clean category
  const toggleDeepCleanChild = (catId: string, child: CategoryChildItem) => {
    const isParentSelected = !!selectedDeepCleanCategories[catId];
    if (isParentSelected) {
      setExcludedChildPaths((prev) => ({
        ...prev,
        [child.path]: !prev[child.path],
      }));
    } else {
      setSelectedChildPaths((prev) => ({
        ...prev,
        [child.path]: !prev[child.path],
      }));
    }
  };

  // Toggle selection for Dev Clean item
  const toggleDevCleanItem = (path: string, id: string, sizeBytes: number) => {
    if (sizeBytes === 0) return;
    const isCurrentlySelected = !!selectedDevItems[path];
    setSelectedDevItems((prev) => ({ ...prev, [path]: !isCurrentlySelected }));

    const children = categoryChildren[id] || [];
    if (children.length > 0) {
      setExcludedChildPaths((prev) => {
        const next = { ...prev };
        children.forEach((c) => delete next[c.path]);
        return next;
      });
      setSelectedChildPaths((prev) => {
        const next = { ...prev };
        children.forEach((c) => delete next[c.path]);
        return next;
      });
    }
  };

  // Toggle selection for child inside Dev Clean item
  const toggleDevCleanChild = (itemPath: string, child: CategoryChildItem) => {
    const isParentSelected = !!selectedDevItems[itemPath];
    if (isParentSelected) {
      setExcludedChildPaths((prev) => ({
        ...prev,
        [child.path]: !prev[child.path],
      }));
    } else {
      setSelectedChildPaths((prev) => ({
        ...prev,
        [child.path]: !prev[child.path],
      }));
    }
  };

  // Purge selected quick clean categories & specific children
  const handlePurgeQuickClean = async () => {
    if (isPurging || !quickCleanResult) return;
    setIsPurging(true);
    setPurgeSuccessMsg(null);
    try {
      const fullCategoryIds: string[] = [];
      const specificPathsToPurge: string[] = [];

      quickCleanResult.categories.forEach((cat) => {
        const isParentSelected = !!selectedCleanCategories[cat.id];
        const children = categoryChildren[cat.id] || [];

        if (isParentSelected) {
          const excluded = children.filter((c) => excludedChildPaths[c.path]);
          if (excluded.length === 0) {
            fullCategoryIds.push(cat.id);
          } else {
            children.filter((c) => !excludedChildPaths[c.path]).forEach((c) => specificPathsToPurge.push(c.path));
          }
        } else {
          children.filter((c) => selectedChildPaths[c.path]).forEach((c) => specificPathsToPurge.push(c.path));
        }
      });

      if (fullCategoryIds.length === 0 && specificPathsToPurge.length === 0) return;

      let totalFreed = 0;
      let totalFiles = 0;

      if (fullCategoryIds.length > 0) {
        const [freedBytes, removedFiles]: [number, number] = await invoke('quick_clean_purge', {
          drive: selectedPath,
          categoryIds: fullCategoryIds,
        });
        totalFreed += freedBytes;
        totalFiles += removedFiles;
      }

      if (specificPathsToPurge.length > 0) {
        const [freedBytes, removedFiles]: [number, number] = await invoke('purge_specific_paths', {
          paths: specificPathsToPurge,
        });
        totalFreed += freedBytes;
        totalFiles += removedFiles;
      }

      setPurgeSuccessMsg(`Successfully cleaned ${formatBytes(totalFreed)} across ${totalFiles.toLocaleString()} files!`);

      const refreshed: QuickCleanResult = await invoke('quick_clean_scan', { drive: selectedPath });
      setQuickCleanResult(refreshed);
      setSelectedCleanCategories({});
      setCategoryChildren({});
      setSelectedChildPaths({});
      setExcludedChildPaths({});
    } catch (err) {
      console.error('Purge error:', err);
    } finally {
      setIsPurging(false);
    }
  };

  // Purge selected deep clean categories & specific children
  const handlePurgeDeepClean = async () => {
    if (isDeepPurging || !deepCleanResult) return;
    setIsDeepPurging(true);
    setDeepPurgeSuccessMsg(null);
    try {
      const fullCategoryIds: string[] = [];
      const specificPathsToPurge: string[] = [];

      deepCleanResult.categories.forEach((cat) => {
        const isParentSelected = !!selectedDeepCleanCategories[cat.id];
        const children = categoryChildren[cat.id] || [];

        if (isParentSelected) {
          const excluded = children.filter((c) => excludedChildPaths[c.path]);
          if (excluded.length === 0) {
            fullCategoryIds.push(cat.id);
          } else {
            children.filter((c) => !excludedChildPaths[c.path]).forEach((c) => specificPathsToPurge.push(c.path));
          }
        } else {
          children.filter((c) => selectedChildPaths[c.path]).forEach((c) => specificPathsToPurge.push(c.path));
        }
      });

      if (fullCategoryIds.length === 0 && specificPathsToPurge.length === 0) return;

      let totalFreed = 0;
      let totalFiles = 0;

      if (fullCategoryIds.length > 0) {
        const [freedBytes, removedFiles]: [number, number] = await invoke('deep_clean_purge', {
          drive: selectedPath,
          categoryIds: fullCategoryIds,
        });
        totalFreed += freedBytes;
        totalFiles += removedFiles;
      }

      if (specificPathsToPurge.length > 0) {
        const [freedBytes, removedFiles]: [number, number] = await invoke('purge_specific_paths', {
          paths: specificPathsToPurge,
        });
        totalFreed += freedBytes;
        totalFiles += removedFiles;
      }

      setDeepPurgeSuccessMsg(`Successfully deep cleaned ${formatBytes(totalFreed)} across ${totalFiles.toLocaleString()} files!`);

      const refreshed: QuickCleanResult = await invoke('deep_clean_scan', { drive: selectedPath });
      setDeepCleanResult(refreshed);
      setSelectedDeepCleanCategories({});
      setCategoryChildren({});
      setSelectedChildPaths({});
      setExcludedChildPaths({});
    } catch (err) {
      console.error('Deep clean purge error:', err);
    } finally {
      setIsDeepPurging(false);
    }
  };

  // Purge selected dev clean items & specific children
  const handlePurgeDevClean = async () => {
    if (isDevPurging || !devCleanResult) return;
    setIsDevPurging(true);
    setDevPurgeSuccessMsg(null);
    try {
      const fullPaths: string[] = [];
      const specificPathsToPurge: string[] = [];

      devCleanResult.items.forEach((item) => {
        const isParentSelected = !!selectedDevItems[item.path];
        const children = categoryChildren[item.id] || [];

        if (isParentSelected) {
          const excluded = children.filter((c) => excludedChildPaths[c.path]);
          if (excluded.length === 0) {
            fullPaths.push(item.path);
          } else {
            children.filter((c) => !excludedChildPaths[c.path]).forEach((c) => specificPathsToPurge.push(c.path));
          }
        } else {
          children.filter((c) => selectedChildPaths[c.path]).forEach((c) => specificPathsToPurge.push(c.path));
        }
      });

      if (fullPaths.length === 0 && specificPathsToPurge.length === 0) return;

      let totalFreed = 0;
      let totalFiles = 0;

      if (fullPaths.length > 0) {
        const [freedBytes, removedFiles]: [number, number] = await invoke('dev_clean_purge', {
          itemPaths: fullPaths,
        });
        totalFreed += freedBytes;
        totalFiles += removedFiles;
      }

      if (specificPathsToPurge.length > 0) {
        const [freedBytes, removedFiles]: [number, number] = await invoke('purge_specific_paths', {
          paths: specificPathsToPurge,
        });
        totalFreed += freedBytes;
        totalFiles += removedFiles;
      }

      setDevPurgeSuccessMsg(`Successfully purged ${formatBytes(totalFreed)} across ${totalFiles.toLocaleString()} build files!`);

      const refreshed: DevCleanResult = await invoke('dev_clean_scan', { drive: selectedPath });
      setDevCleanResult(refreshed);
      setSelectedDevItems({});
      setCategoryChildren({});
      setSelectedChildPaths({});
      setExcludedChildPaths({});
    } catch (err) {
      console.error('Dev purge error:', err);
    } finally {
      setIsDevPurging(false);
    }
  };

  // Purge selected duplicate files
  const handlePurgeDuplicates = async () => {
    if (isDupPurging || !duplicateResult) return;
    setIsDupPurging(true);
    setDupPurgeSuccessMsg(null);
    try {
      const activePaths = Object.keys(selectedDuplicateFiles).filter((k) => selectedDuplicateFiles[k]);
      if (activePaths.length === 0) return;

      const [freedBytes, removedFiles]: [number, number] = await invoke('duplicate_purge', {
        filePaths: activePaths,
      });

      setDupPurgeSuccessMsg(`Successfully deleted ${formatBytes(freedBytes)} across ${removedFiles.toLocaleString()} duplicate files!`);

      const refreshed: DuplicateFinderResult = await invoke('duplicate_scan', { drive: selectedPath });
      setDuplicateResult(refreshed);
      setSelectedDuplicateFiles({});
    } catch (err) {
      console.error('Duplicate purge error:', err);
    } finally {
      setIsDupPurging(false);
    }
  };

  // Global keyboard shortcuts (Enter to scan)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      if (e.key === 'Enter' && !isScanning) {
        if (activeMode === 'explorer' && summary === null) {
          handleStartScan();
        } else if (activeMode === 'quick_clean' && quickCleanResult === null) {
          handleStartScan();
        } else if (activeMode === 'deep_clean' && deepCleanResult === null) {
          handleStartScan();
        } else if (activeMode === 'dev_clean' && devCleanResult === null) {
          handleStartScan();
        } else if (activeMode === 'duplicates' && duplicateResult === null) {
          handleStartScan();
        } else if (activeMode === 'space_saver' && spaceSaverResult === null) {
          handleStartScan();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isScanning,
    summary,
    activeMode,
    quickCleanResult,
    deepCleanResult,
    devCleanResult,
    duplicateResult,
    spaceSaverResult,
    handleStartScan,
  ]);

  // Prevent default browser context menu globally
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  const handleSelectDrive = (drivePath: string) => {
    setSelectedPath(drivePath);
    setSummary(null);
    setProgress(null);
    setSelectedCategory('All');
    setQuickCleanResult(null);
    setPurgeSuccessMsg(null);
    setDeepCleanResult(null);
    setDeepPurgeSuccessMsg(null);
    setDevCleanResult(null);
    setDevPurgeSuccessMsg(null);
    setDuplicateResult(null);
    setDupPurgeSuccessMsg(null);
    setSpaceSaverResult(null);
    setCompressSuccessMsg(null);
    setSelectedSpaceSaverItems({});
    setExpandedCategories({});
    setCategoryChildren({});
    setLoadingChildren({});
    setSelectedChildPaths({});
    setExcludedChildPaths({});
  };

  const currentDrive = drives.find(
    (d) => d.mount_point.toLowerCase() === selectedPath.toLowerCase()
  ) || drives[0];

  const isScanned = summary !== null;

  // Compute total selected size for Quick Clean (including granular child selection)
  const totalSelectedCleanSize = quickCleanResult
    ? quickCleanResult.categories.reduce((sum, cat) => {
        if (selectedCleanCategories[cat.id]) {
          const excludedBytes = (categoryChildren[cat.id] || [])
            .filter((c) => excludedChildPaths[c.path])
            .reduce((cSum, c) => cSum + c.size_bytes, 0);
          return sum + Math.max(0, cat.size_bytes - excludedBytes);
        } else {
          const childBytes = (categoryChildren[cat.id] || [])
            .filter((c) => selectedChildPaths[c.path])
            .reduce((cSum, c) => cSum + c.size_bytes, 0);
          return sum + childBytes;
        }
      }, 0)
    : 0;

  // Compute total selected size for Deep Clean
  const totalSelectedDeepCleanSize = deepCleanResult
    ? deepCleanResult.categories.reduce((sum, cat) => {
        if (selectedDeepCleanCategories[cat.id]) {
          const excludedBytes = (categoryChildren[cat.id] || [])
            .filter((c) => excludedChildPaths[c.path])
            .reduce((cSum, c) => cSum + c.size_bytes, 0);
          return sum + Math.max(0, cat.size_bytes - excludedBytes);
        } else {
          const childBytes = (categoryChildren[cat.id] || [])
            .filter((c) => selectedChildPaths[c.path])
            .reduce((cSum, c) => cSum + c.size_bytes, 0);
          return sum + childBytes;
        }
      }, 0)
    : 0;

  // Compute total selected size for Dev Cleaner
  const totalSelectedDevSize = devCleanResult
    ? devCleanResult.items.reduce((sum, item) => {
        if (selectedDevItems[item.path]) {
          const excludedBytes = (categoryChildren[item.id] || [])
            .filter((c) => excludedChildPaths[c.path])
            .reduce((cSum, c) => cSum + c.size_bytes, 0);
          return sum + Math.max(0, item.size_bytes - excludedBytes);
        } else {
          const childBytes = (categoryChildren[item.id] || [])
            .filter((c) => selectedChildPaths[c.path])
            .reduce((cSum, c) => cSum + c.size_bytes, 0);
          return sum + childBytes;
        }
      }, 0)
    : 0;

  // Compute total selected size for Duplicate Finder
  const totalSelectedDuplicateSize = duplicateResult
    ? duplicateResult.groups.reduce((sum, group) => {
        const groupWasted = group.files
          .filter((f) => selectedDuplicateFiles[f.path])
          .reduce((fSum, f) => fSum + f.size_bytes, 0);
        return sum + groupWasted;
      }, 0)
    : 0;

  // Space Saver handlers & calculations
  const toggleSpaceSaverItem = (id: string) => {
    setSelectedSpaceSaverItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const selectedSpaceSaverCount = spaceSaverResult
    ? spaceSaverResult.items.filter((i) => selectedSpaceSaverItems[i.id]).length
    : 0;

  const totalSelectedSavingsSize = spaceSaverResult
    ? spaceSaverResult.items
        .filter((i) => selectedSpaceSaverItems[i.id])
        .reduce((sum, i) => sum + i.estimated_savings_bytes, 0)
    : 0;

  const handleCompressSpaceSaver = async () => {
    if (!spaceSaverResult || isCompressing || selectedSpaceSaverCount === 0) return;
    const pathsToCompress = spaceSaverResult.items
      .filter((i) => selectedSpaceSaverItems[i.id])
      .map((i) => i.path);

    if (pathsToCompress.length === 0) return;

    setIsCompressing(true);
    setCompressSuccessMsg(null);

    try {
      const options: SpaceSaverCompressOptions = {
        paths: pathsToCompress,
        mode: spaceSaverMode,
        remove_original: spaceSaverMode === 'zip' && spaceSaverRemoveOriginal,
      };

      const result: SpaceSaverCompressResult = await invoke('space_saver_compress', { options });
      if (result.success) {
        const freedFormatted = result.freed_bytes > 0 ? ` Freed ${formatBytes(result.freed_bytes)}.` : '';
        setCompressSuccessMsg(`${result.message}${freedFormatted}`);
        const updated: SpaceSaverResult = await invoke('space_saver_scan', { drive: selectedPath });
        setSpaceSaverResult(updated);
        setSelectedSpaceSaverItems({});
      }
    } catch (err) {
      console.error('Compression error:', err);
      setCompressSuccessMsg('Failed to compress selected items. Please check folder permissions.');
    } finally {
      setIsCompressing(false);
    }
  };

  const renderToolView = () => {
    switch (activeMode) {
      case 'quick_clean':
        return (
          <div className="tool-view-container">
            {isScanning && quickCleanResult === null ? (
              <div className="tool-view-content">
                <div className="tool-hero-box">
                  <div className="tool-hero-icon">
                    <Loader2 size={30} className="spin-icon" />
                  </div>
                  <h2 className="tool-hero-title">Scanning Junk & Cache Files</h2>
                  <p className="tool-hero-desc">
                    Checking temporary application caches, Windows update scraps, crash logs, and browser caches...
                  </p>
                </div>
              </div>
            ) : quickCleanResult === null ? (
              <div className="tool-view-content">
                <div className="tool-hero-box">
                  <div className="tool-hero-icon">
                    <Sparkles size={30} />
                  </div>
                  <h2 className="tool-hero-title">Quick System & Temp Cleaner</h2>
                  <p className="tool-hero-desc">
                    Safely purge temporary files, Windows update downloads, crash reports,
                    and browser web caches with zero impact to your system.
                  </p>
                  <button
                    type="button"
                    className="canvas-hero-btn-filled"
                    onClick={handleStartScan}
                  >
                    <Sparkles size={16} />
                    <span>Scan Junk Files</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="quick-clean-results">
                <div className="clean-results-topbar">
                  <div className="clean-topbar-left">
                    <span className="clean-total-badge">
                      <Sparkles size={14} />
                      <span>{formatBytes(totalSelectedCleanSize)} Selected</span>
                    </span>
                    <span className="clean-scan-meta">
                      Discovered {formatBytes(quickCleanResult.total_size_bytes)} ({quickCleanResult.total_files.toLocaleString()} files) in {quickCleanResult.elapsed_ms}ms
                    </span>
                  </div>
                  <div className="clean-topbar-right">
                    <button
                      type="button"
                      className="clean-purge-btn"
                      disabled={isPurging || totalSelectedCleanSize === 0}
                      onClick={handlePurgeQuickClean}
                    >
                      {isPurging ? (
                        <>
                          <Loader2 size={14} className="spin-icon" />
                          <span>Cleaning...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          <span>Clean</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {purgeSuccessMsg && (
                  <div className="clean-success-banner">
                    <CheckCircle2 size={16} />
                    <span>{purgeSuccessMsg}</span>
                  </div>
                )}

                <div className="clean-items-scroll">
                  {quickCleanResult.categories.map((cat) => {
                    const isParentSelected = !!selectedCleanCategories[cat.id];
                    const isExpanded = !!expandedCategories[cat.id];
                    const children = categoryChildren[cat.id] || [];
                    const isLoading = !!loadingChildren[cat.id];
                    const hasSpecificChildren = children.length > 0 && !isParentSelected && children.some((c) => selectedChildPaths[c.path]);
                    const isRowHighlighted = isParentSelected || hasSpecificChildren;

                    return (
                      <React.Fragment key={cat.id}>
                        <div
                          className={`clean-item-card ${isRowHighlighted ? 'selected-row' : ''} ${cat.size_bytes === 0 ? 'empty' : ''}`}
                          title={cat.path || cat.description}
                          onClick={() => toggleQuickCleanCategory(cat.id, cat.size_bytes)}
                        >
                          <div className="clean-item-left">
                            {cat.size_bytes > 0 && cat.path ? (
                              <button
                                type="button"
                                className="clean-chevron-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpandCategory(cat.id, cat.path);
                                }}
                                title={isExpanded ? 'Collapse folder' : 'Expand folder to see details'}
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            ) : (
                              <span className="clean-chevron-spacer" />
                            )}
                            <Folder size={15} className="folder-icon" />
                            <div className="clean-item-info">
                              <span className="clean-item-name">{cat.name}</span>
                              <span className="clean-item-desc">{cat.description}</span>
                              <span className="clean-item-path">{cat.path}</span>
                            </div>
                          </div>
                          <div className="clean-item-right">
                            <span className="clean-item-size">{formatBytes(cat.size_bytes)}</span>
                            <span className="clean-item-files">
                              {cat.file_count > 0 ? `${cat.file_count.toLocaleString()} files` : 'Clean'}
                            </span>
                          </div>
                        </div>

                        {/* Granular Child Items when expanded */}
                        {isExpanded && (
                          <div className="clean-child-list">
                            {isLoading ? (
                              <div className="clean-child-status">
                                <Loader2 size={13} className="spin-icon" />
                                <span>Scanning folder items...</span>
                              </div>
                            ) : children.length === 0 ? (
                              <div className="clean-child-status">
                                <span>Folder is clean or items locked by running processes</span>
                              </div>
                            ) : (
                              children.map((child) => {
                                const isChildSelected = isParentSelected
                                  ? !excludedChildPaths[child.path]
                                  : !!selectedChildPaths[child.path];
                                return (
                                  <div
                                    key={child.path}
                                    className={`clean-child-row ${isChildSelected ? 'selected-row' : ''}`}
                                    title={child.path}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleQuickCleanChild(cat.id, child);
                                    }}
                                  >
                                    <div className="clean-child-left">
                                      {child.is_dir ? (
                                        <Folder size={14} className="folder-icon" />
                                      ) : (
                                        <File size={14} className="clean-file-icon" />
                                      )}
                                      <span className="clean-child-name">{child.name}</span>
                                      <span className="clean-child-path">{child.path}</span>
                                    </div>
                                    <div className="clean-child-right">
                                      <span className="clean-child-size">{formatBytes(child.size_bytes)}</span>
                                      {child.is_dir && child.file_count > 0 && (
                                        <span className="clean-child-count">{child.file_count.toLocaleString()} files</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );

      case 'dev_clean':
        return (
          <div className="tool-view-container">
            {isScanning && devCleanResult === null ? (
              <div className="tool-view-content">
                <div className="tool-hero-box">
                  <div className="tool-hero-icon">
                    <Loader2 size={30} className="spin-icon" />
                  </div>
                  <h2 className="tool-hero-title">Scanning Developer Projects</h2>
                  <p className="tool-hero-desc">
                    Locating heavy node_modules, Rust target folders, Python .venv environments, and build caches...
                  </p>
                </div>
              </div>
            ) : devCleanResult === null ? (
              <div className="tool-view-content">
                <div className="tool-hero-box">
                  <div className="tool-hero-icon">
                    <Terminal size={30} />
                  </div>
                  <h2 className="tool-hero-title">Developer Build Artifact Cleaner</h2>
                  <p className="tool-hero-desc">
                    Scan and reclaim gigabytes from unused <code>node_modules</code>, Rust <code>target/</code>,
                    Python <code>.venv</code>, and build caches across your projects.
                  </p>
                  <button
                    type="button"
                    className="canvas-hero-btn-filled"
                    onClick={handleStartScan}
                  >
                    <Terminal size={16} />
                    <span>Scan Projects</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="quick-clean-results">
                <div className="clean-results-topbar">
                  <div className="clean-topbar-left">
                    <span className="clean-total-badge">
                      <Terminal size={14} />
                      <span>{formatBytes(totalSelectedDevSize)} Selected</span>
                    </span>
                    <span className="clean-scan-meta">
                      Discovered {devCleanResult.total_artifacts} project build targets ({formatBytes(devCleanResult.total_size_bytes)}) in {devCleanResult.elapsed_ms}ms
                    </span>
                  </div>
                  <div className="clean-topbar-right">
                    <button
                      type="button"
                      className="clean-purge-btn"
                      disabled={isDevPurging || totalSelectedDevSize === 0}
                      onClick={handlePurgeDevClean}
                    >
                      {isDevPurging ? (
                        <>
                          <Loader2 size={14} className="spin-icon" />
                          <span>Cleaning...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          <span>Clean</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {devPurgeSuccessMsg && (
                  <div className="clean-success-banner">
                    <CheckCircle2 size={16} />
                    <span>{devPurgeSuccessMsg}</span>
                  </div>
                )}

                <div className="clean-items-scroll">
                  {devCleanResult.items.length === 0 ? (
                    <div className="clean-empty-box">
                      <CheckCircle2 size={32} />
                      <span className="clean-empty-title">Clean! No heavy build artifacts detected.</span>
                    </div>
                  ) : (
                    devCleanResult.items.map((item) => {
                      const isParentSelected = !!selectedDevItems[item.path];
                      const isExpanded = !!expandedCategories[item.id];
                      const children = categoryChildren[item.id] || [];
                      const isLoading = !!loadingChildren[item.id];
                      const hasSpecificChildren = children.length > 0 && !isParentSelected && children.some((c) => selectedChildPaths[c.path]);
                      const isItemHighlighted = isParentSelected || hasSpecificChildren;

                      return (
                        <React.Fragment key={item.id}>
                          <div
                            className={`clean-item-card ${isItemHighlighted ? 'selected-row' : ''}`}
                            title={item.path}
                            onClick={() => toggleDevCleanItem(item.path, item.id, item.size_bytes)}
                          >
                            <div className="clean-item-left">
                              {item.size_bytes > 0 && item.path ? (
                                <button
                                  type="button"
                                  className="clean-chevron-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpandCategory(item.id, item.path);
                                  }}
                                  title={isExpanded ? 'Collapse folder' : 'Expand folder to see details'}
                                >
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              ) : (
                                <span className="clean-chevron-spacer" />
                              )}
                              <Folder size={15} className="folder-icon" />
                              <div className="clean-item-info">
                                <div className="clean-item-title-row">
                                  <span className="clean-item-name">{item.project_name}</span>
                                  <span className="clean-artifact-pill">{item.artifact_type}</span>
                                </div>
                                <span className="clean-item-path">{item.path}</span>
                              </div>
                            </div>
                            <div className="clean-item-right">
                              <span className="clean-item-size">{formatBytes(item.size_bytes)}</span>
                              <span className="clean-item-files">
                                {item.file_count > 0 ? `${item.file_count.toLocaleString()} files` : 'Empty'}
                              </span>
                            </div>
                          </div>

                          {/* Granular Child Items for Dev Cleaner */}
                          {isExpanded && (
                            <div className="clean-child-list">
                              {isLoading ? (
                                <div className="clean-child-status">
                                  <Loader2 size={13} className="spin-icon" />
                                  <span>Scanning project build files...</span>
                                </div>
                              ) : children.length === 0 ? (
                                <div className="clean-child-status">
                                  <span>No subfolders found</span>
                                </div>
                              ) : (
                                children.map((child) => {
                                  const isChildSelected = isParentSelected
                                    ? !excludedChildPaths[child.path]
                                    : !!selectedChildPaths[child.path];
                                  return (
                                    <div
                                      key={child.path}
                                      className={`clean-child-row ${isChildSelected ? 'selected-row' : ''}`}
                                      title={child.path}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleDevCleanChild(item.path, child);
                                      }}
                                    >
                                      <div className="clean-child-left">
                                        {child.is_dir ? (
                                          <Folder size={14} className="folder-icon" />
                                        ) : (
                                          <File size={14} className="clean-file-icon" />
                                        )}
                                        <span className="clean-child-name">{child.name}</span>
                                        <span className="clean-child-path">{child.path}</span>
                                      </div>
                                      <div className="clean-child-right">
                                        <span className="clean-child-size">{formatBytes(child.size_bytes)}</span>
                                        {child.is_dir && child.file_count > 0 && (
                                          <span className="clean-child-count">{child.file_count.toLocaleString()} files</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 'duplicates':
        return (
          <div className="tool-view-container">
            {isScanning && duplicateResult === null ? (
              <div className="tool-view-content">
                <div className="tool-hero-box">
                  <div className="tool-hero-icon">
                    <Loader2 size={30} className="spin-icon" />
                  </div>
                  <h2 className="tool-hero-title">Scanning for Duplicate Files</h2>
                  <p className="tool-hero-desc">
                    Computing sizes and partial content hashes across your libraries to group identical copies...
                  </p>
                </div>
              </div>
            ) : duplicateResult === null ? (
              <div className="tool-view-content">
                <div className="tool-hero-box">
                  <div className="tool-hero-icon">
                    <Copy size={30} />
                  </div>
                  <h2 className="tool-hero-title">Duplicate Files Finder</h2>
                  <p className="tool-hero-desc">
                    Identify duplicate files eating up space by comparing exact content hashes,
                    and reclaim storage with one click.
                  </p>
                  <button
                    type="button"
                    className="canvas-hero-btn-filled"
                    onClick={handleStartScan}
                  >
                    <Copy size={16} />
                    <span>Find Duplicates</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="quick-clean-results">
                <div className="clean-results-topbar">
                  <div className="clean-topbar-left">
                    <span className="clean-total-badge">
                      <Copy size={14} />
                      <span>{formatBytes(totalSelectedDuplicateSize)} Selected</span>
                    </span>
                    <span className="clean-scan-meta">
                      Found {duplicateResult.total_duplicate_files.toLocaleString()} redundant duplicates ({formatBytes(duplicateResult.total_wasted_bytes)} wasted) in {duplicateResult.elapsed_ms}ms
                    </span>
                  </div>
                  <div className="clean-topbar-right">
                    <button
                      type="button"
                      className="clean-purge-btn"
                      disabled={isDupPurging || totalSelectedDuplicateSize === 0}
                      onClick={handlePurgeDuplicates}
                    >
                      {isDupPurging ? (
                        <>
                          <Loader2 size={14} className="spin-icon" />
                          <span>Cleaning...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          <span>Clean</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {dupPurgeSuccessMsg && (
                  <div className="clean-success-banner">
                    <CheckCircle2 size={16} />
                    <span>{dupPurgeSuccessMsg}</span>
                  </div>
                )}

                <div className="clean-items-scroll">
                  {duplicateResult.groups.length === 0 ? (
                    <div className="clean-empty-box">
                      <CheckCircle2 size={32} />
                      <span className="clean-empty-title">Zero duplicate files found. Your folders are clean!</span>
                    </div>
                  ) : (
                    duplicateResult.groups.map((group) => {
                      const isCollapsed = !!collapsedDupGroups[group.id];
                      return (
                        <div key={group.id} className="dup-group-card">
                          <div
                            className="dup-group-header"
                            onClick={() =>
                              setCollapsedDupGroups((prev) => ({
                                ...prev,
                                [group.id]: !prev[group.id],
                              }))
                            }
                          >
                            <div className="dup-group-header-left">
                              <button
                                type="button"
                                className="clean-chevron-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCollapsedDupGroups((prev) => ({
                                    ...prev,
                                    [group.id]: !prev[group.id],
                                  }));
                                }}
                              >
                                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                              </button>
                              <span className="dup-group-filename">{group.file_name}</span>
                            </div>
                            <span className="dup-group-meta">
                              Each: {formatBytes(group.size_bytes)} • Wasting {formatBytes(group.wasted_bytes)}
                            </span>
                          </div>
                          {!isCollapsed && (
                            <div className="dup-group-files">
                              {group.files.map((file, idx) => {
                                const isChecked = !!selectedDuplicateFiles[file.path];
                                const isOriginal = idx === 0;
                                return (
                                  <div
                                    key={file.path}
                                    className={`dup-file-row ${isChecked ? 'selected-row' : ''} ${isOriginal ? 'original' : ''}`}
                                    onClick={() => {
                                      setSelectedDuplicateFiles((prev) => ({
                                        ...prev,
                                        [file.path]: !prev[file.path],
                                      }));
                                    }}
                                  >
                                    <div className="dup-file-info">
                                      <File size={14} className="clean-file-icon" />
                                      <span className={`dup-role-badge ${isOriginal ? 'badge-orig' : 'badge-dup'}`}>
                                        {isOriginal ? 'Original' : 'Duplicate'}
                                      </span>
                                      <span className="dup-file-path">{file.path}</span>
                                    </div>
                                    <span className="dup-file-size">{formatBytes(file.size_bytes)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 'deep_clean':
        return (
          <div className="tool-view-container">
            {isScanning && deepCleanResult === null ? (
              <div className="tool-view-content">
                <div className="tool-hero-box">
                  <div className="tool-hero-icon">
                    <Loader2 size={30} className="spin-icon" />
                  </div>
                  <h2 className="tool-hero-title">Performing Deep System Scan</h2>
                  <p className="tool-hero-desc">
                    Scanning previous Windows installations (Windows.old), driver packages, shader caches, and crash dumps...
                  </p>
                </div>
              </div>
            ) : deepCleanResult === null ? (
              <div className="tool-view-content">
                <div className="tool-hero-box">
                  <div className="tool-hero-icon">
                    <Trash2 size={30} />
                  </div>
                  <h2 className="tool-hero-title">Deep System Cleaner</h2>
                  <p className="tool-hero-desc">
                    Reclaim massive space from previous Windows installations (<code>Windows.old</code>),
                    stale driver staging, memory dumps, shader caches, and Recycle Bin.
                  </p>
                  <button
                    type="button"
                    className="canvas-hero-btn-filled"
                    onClick={handleStartScan}
                  >
                    <Trash2 size={16} />
                    <span>Deep Scan</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="quick-clean-results">
                <div className="clean-results-topbar">
                  <div className="clean-topbar-left">
                    <span className="clean-total-badge">
                      <Trash2 size={14} />
                      <span>{formatBytes(totalSelectedDeepCleanSize)} Selected</span>
                    </span>
                    <span className="clean-scan-meta">
                      Discovered {formatBytes(deepCleanResult.total_size_bytes)} ({deepCleanResult.total_files.toLocaleString()} files) in {deepCleanResult.elapsed_ms}ms
                    </span>
                  </div>
                  <div className="clean-topbar-right">
                    <button
                      type="button"
                      className="clean-purge-btn"
                      disabled={isDeepPurging || totalSelectedDeepCleanSize === 0}
                      onClick={handlePurgeDeepClean}
                    >
                      {isDeepPurging ? (
                        <>
                          <Loader2 size={14} className="spin-icon" />
                          <span>Cleaning...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          <span>Clean</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {deepPurgeSuccessMsg && (
                  <div className="clean-success-banner">
                    <CheckCircle2 size={16} />
                    <span>{deepPurgeSuccessMsg}</span>
                  </div>
                )}

                <div className="clean-items-scroll">
                  {deepCleanResult.categories.map((cat) => {
                    const isParentSelected = !!selectedDeepCleanCategories[cat.id];
                    const isExpanded = !!expandedCategories[cat.id];
                    const children = categoryChildren[cat.id] || [];
                    const isLoading = !!loadingChildren[cat.id];
                    const hasSpecificChildren = children.length > 0 && !isParentSelected && children.some((c) => selectedChildPaths[c.path]);
                    const isRowHighlighted = isParentSelected || hasSpecificChildren;

                    return (
                      <React.Fragment key={cat.id}>
                        <div
                          className={`clean-item-card ${isRowHighlighted ? 'selected-row' : ''} ${cat.size_bytes === 0 ? 'empty' : ''}`}
                          title={cat.path || cat.description}
                          onClick={() => toggleDeepCleanCategory(cat.id, cat.size_bytes)}
                        >
                          <div className="clean-item-left">
                            {cat.size_bytes > 0 && cat.path ? (
                              <button
                                type="button"
                                className="clean-chevron-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpandCategory(cat.id, cat.path);
                                }}
                                title={isExpanded ? 'Collapse folder' : 'Expand folder to see details'}
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            ) : (
                              <span className="clean-chevron-spacer" />
                            )}
                            <Folder size={15} className="folder-icon" />
                            <div className="clean-item-info">
                              <div className="clean-item-title-row">
                                <span className="clean-item-name">{cat.name}</span>
                                {!cat.is_safe && (
                                  <span className="clean-caution-tag">
                                    <AlertTriangle size={11} />
                                    <span>Caution</span>
                                  </span>
                                )}
                              </div>
                              <span className="clean-item-desc">{cat.description}</span>
                              <span className="clean-item-path">{cat.path}</span>
                            </div>
                          </div>
                          <div className="clean-item-right">
                            <span className="clean-item-size">{formatBytes(cat.size_bytes)}</span>
                            <span className="clean-item-files">
                              {cat.file_count > 0 ? `${cat.file_count.toLocaleString()} files` : 'Clean'}
                            </span>
                          </div>
                        </div>

                        {/* Granular Child Items for Deep Clean */}
                        {isExpanded && (
                          <div className="clean-child-list">
                            {isLoading ? (
                              <div className="clean-child-status">
                                <Loader2 size={13} className="spin-icon" />
                                <span>Scanning folder items...</span>
                              </div>
                            ) : children.length === 0 ? (
                              <div className="clean-child-status">
                                <span>Folder is clean or items locked by Windows System</span>
                              </div>
                            ) : (
                              children.map((child) => {
                                const isChildSelected = isParentSelected
                                  ? !excludedChildPaths[child.path]
                                  : !!selectedChildPaths[child.path];
                                return (
                                  <div
                                    key={child.path}
                                    className={`clean-child-row ${isChildSelected ? 'selected-row' : ''}`}
                                    title={child.path}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleDeepCleanChild(cat.id, child);
                                    }}
                                  >
                                    <div className="clean-child-left">
                                      {child.is_dir ? (
                                        <Folder size={14} className="folder-icon" />
                                      ) : (
                                        <File size={14} className="clean-file-icon" />
                                      )}
                                      <span className="clean-child-name">{child.name}</span>
                                      <span className="clean-child-path">{child.path}</span>
                                    </div>
                                    <div className="clean-child-right">
                                      <span className="clean-child-size">{formatBytes(child.size_bytes)}</span>
                                      {child.is_dir && child.file_count > 0 && (
                                        <span className="clean-child-count">{child.file_count.toLocaleString()} files</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );

      case 'space_saver':
        return (
          <div className="tool-view-container">
            {isScanning && spaceSaverResult === null ? (
              <div className="tool-view-content">
                <div className="tool-hero-box">
                  <div className="tool-hero-icon">
                    <Loader2 size={30} className="spin-icon" />
                  </div>
                  <h2 className="tool-hero-title">Scanning Compressible Targets</h2>
                  <p className="tool-hero-desc">
                    Locating bulky folders, uncompressed datasets, large media, and compressible files across your drive...
                  </p>
                </div>
              </div>
            ) : spaceSaverResult === null ? (
              <div className="tool-view-content">
                <div className="tool-hero-box">
                  <div className="tool-hero-icon">
                    <Archive size={30} />
                  </div>
                  <h2 className="tool-hero-title">Space Saver & Disk Reducer</h2>
                  <p className="tool-hero-desc">
                    Reclaim gigabytes of storage by compressing bulky folders, datasets, and uncompressed files into standard ZIP archives or transparent Windows NTFS LZX blocks.
                  </p>
                  <button
                    type="button"
                    className="canvas-hero-btn-filled"
                    onClick={handleStartScan}
                  >
                    <Archive size={16} />
                    <span>Scan Compressible Targets</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="quick-clean-results">
                <div className="clean-results-topbar">
                  <div className="clean-topbar-left">
                    <span className="clean-total-badge">
                      <Archive size={14} />
                      <span>{formatBytes(totalSelectedSavingsSize)} Est. Savings</span>
                    </span>
                    <span className="clean-scan-meta">
                      {spaceSaverResult.total_items} candidates • {formatBytes(spaceSaverResult.total_original_bytes)} total
                    </span>
                  </div>
                  <div className="clean-topbar-right">
                    <div className="saver-options-group">
                      <div className="saver-mode-toggle">
                        <button
                          type="button"
                          className={`saver-mode-pill ${spaceSaverMode === 'zip' ? 'active' : ''}`}
                          onClick={() => setSpaceSaverMode('zip')}
                          title="Compress items into portable standard .zip files"
                        >
                          ZIP Archive
                        </button>
                        <button
                          type="button"
                          className={`saver-mode-pill ${spaceSaverMode === 'compact' ? 'active' : ''}`}
                          onClick={() => setSpaceSaverMode('compact')}
                          title="Compress items transparently in-place using Windows NTFS LZX"
                        >
                          NTFS Compact
                        </button>
                      </div>

                      {spaceSaverMode === 'zip' && (
                        <label className="saver-checkbox-label" title="Move original files to Recycle Bin after creating .zip archive">
                          <input
                            type="checkbox"
                            checked={spaceSaverRemoveOriginal}
                            onChange={(e) => setSpaceSaverRemoveOriginal(e.target.checked)}
                          />
                          <span>Recycle original</span>
                        </label>
                      )}

                      <button
                        type="button"
                        className="clean-purge-btn"
                        disabled={isCompressing || selectedSpaceSaverCount === 0}
                        onClick={handleCompressSpaceSaver}
                        title={spaceSaverMode === 'zip' ? 'Create ZIP archive for selected items' : 'Compress selected items using NTFS LZX'}
                      >
                        {isCompressing ? (
                          <>
                            <Loader2 size={14} className="spin-icon" />
                            <span>Compressing...</span>
                          </>
                        ) : (
                          <>
                            <Archive size={14} />
                            <span>Compress Selected ({selectedSpaceSaverCount})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {compressSuccessMsg && (
                  <div className="clean-success-banner">
                    <CheckCircle2 size={16} />
                    <span>{compressSuccessMsg}</span>
                  </div>
                )}

                <div className="clean-items-scroll saver-items-scroll">
                  {spaceSaverResult.items.map((item) => {
                    const isSelected = !!selectedSpaceSaverItems[item.id];
                    return (
                      <div
                        key={item.id}
                        className={`saver-card ${isSelected ? 'selected' : ''}`}
                        title={item.path}
                        onClick={() => toggleSpaceSaverItem(item.id)}
                      >
                        <div className="saver-card-left">
                          <div className="saver-icon-wrapper">
                            {item.is_dir ? (
                              <Folder size={17} className="folder-icon" />
                            ) : (
                              <File size={17} className="clean-file-icon" />
                            )}
                          </div>
                          <div className="saver-text-block">
                            <div className="saver-title-row">
                              <span className="saver-name">{item.name}</span>
                              <span className="saver-tag">{item.category}</span>
                              <span className="saver-badge">-{item.compression_ratio_pct}%</span>
                            </div>
                            <div className="saver-path-row">
                              <span className="saver-path">{item.path}</span>
                            </div>
                          </div>
                        </div>

                        <div className="saver-card-right">
                          <div className="saver-stats-block">
                            <span className="saver-compressed-size">~{formatBytes(item.estimated_compressed_bytes)}</span>
                            <span className="saver-orig-size">from {formatBytes(item.original_size_bytes)}</span>
                          </div>
                          <div className="saver-savings-pill">
                            Save ~{formatBytes(item.estimated_savings_bytes)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fluent-app-container">
      {/* Sleek Dark Custom Header */}
      <TitleBar />

      {/* Main App Body: 3-column layout (Left Sidebar | Center Viewport | Right Sidebar) */}
      <div className="fluent-main-body">
        {/* Left Storage Sidebar: Modes & Drives Selection */}
        <StorageSidebar
          drives={drives}
          selectedPath={selectedPath}
          onSelectDrive={handleSelectDrive}
          activeMode={activeMode}
          onSelectMode={setActiveMode}
        />

        {/* Center Content Panel */}
        <div className="fluent-center-viewport">
          {activeMode === 'explorer' ? (
            <MainContentView
              rootId={summary ? summary.root_id : null}
              isScanning={isScanning}
              progress={progress}
              selectedPath={selectedPath}
              onStartScan={handleStartScan}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              activeView={activeView}
            />
          ) : (
            renderToolView()
          )}
        </div>

        {/* Right Sidebar: View Toggle & Drive Info Donut Gauge */}
        <RightSidebar
          currentDrive={currentDrive}
          totalBytesScanned={summary ? summary.total_bytes : 0}
          isScanned={isScanned}
          activeView={activeView}
          onSelectView={setActiveView}
          showViewToggle={activeMode === 'explorer'}
        />
      </div>
    </div>
  );
};

export default App;

