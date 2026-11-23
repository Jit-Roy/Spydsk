import React from 'react';
import {
  Home,
  Sparkles,
  Terminal,
  Copy,
  Trash2,
  Archive,
  HardDrive,
  ChevronDown,
  Settings,
} from 'lucide-react';
import { DriveInfo, AppMode } from '../types';
import { formatBytes } from '../utils';

interface StorageSidebarProps {
  drives: DriveInfo[];
  selectedPath: string;
  onSelectDrive: (drivePath: string) => void;
  activeMode: AppMode;
  onSelectMode: (mode: AppMode) => void;
}

export const StorageSidebar: React.FC<StorageSidebarProps> = ({
  drives,
  selectedPath,
  onSelectDrive,
  activeMode,
  onSelectMode,
}) => {
  const modes: {
    key: AppMode;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      key: 'explorer',
      label: 'Home',
      icon: <Home size={16} />,
    },
    {
      key: 'quick_clean',
      label: 'Quick Clean',
      icon: <Sparkles size={16} />,
    },
    {
      key: 'dev_clean',
      label: 'Dev Cleaner',
      icon: <Terminal size={16} />,
    },
    {
      key: 'duplicates',
      label: 'Duplicates',
      icon: <Copy size={16} />,
    },
    {
      key: 'deep_clean',
      label: 'Deep Clean',
      icon: <Trash2 size={16} />,
    },
    {
      key: 'space_saver',
      label: 'Space Saver',
      icon: <Archive size={16} />,
    },
  ];

  return (
    <aside className="storage-sidebar">
      {/* 1. Modes List (Home, Quick Clean, Dev Cleaner, Duplicates, Deep Clean, Space Saver) */}
      <div className="sidebar-modes-list">
        {modes.map((mode) => {
          const isActive = activeMode === mode.key;
          return (
            <div
              key={mode.key}
              className={`sidebar-item-row ${isActive ? 'active' : ''}`}
              onClick={() => onSelectMode(mode.key)}
              title={mode.label}
            >
              <span className="sidebar-item-icon">{mode.icon}</span>
              <span className="sidebar-item-label">{mode.label}</span>
            </div>
          );
        })}
      </div>

      {/* 2. Drives Section */}
      <div className="sidebar-drives-section">
        <div className="sidebar-section-header">
          <span>Drives</span>
          <ChevronDown size={13} className="sidebar-section-chevron" />
        </div>
        <div className="sidebar-drives-list">
          {drives.map((d) => {
            const isSelected =
              d.mount_point.toLowerCase() === selectedPath.toLowerCase();
            const cleanMount = d.mount_point.replace('\\', '');
            const label = cleanMount.toLowerCase().startsWith('c')
              ? `${cleanMount}: (${d.volume_name || 'OS'})`
              : `${cleanMount}:`;

            return (
              <div
                key={d.mount_point}
                className={`sidebar-item-row ${isSelected ? 'active' : ''}`}
                onClick={() => onSelectDrive(d.mount_point)}
                title={`${d.mount_point} (${formatBytes(d.free_bytes)} free of ${formatBytes(d.total_bytes)})`}
              >
                <span className="sidebar-item-icon">
                  <HardDrive size={16} />
                </span>
                <span className="sidebar-item-label">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Settings at the bottom */}
      <div className="sidebar-footer">
        <div className="sidebar-item-row" title="Settings">
          <span className="sidebar-item-icon">
            <Settings size={16} />
          </span>
          <span className="sidebar-item-label">Settings</span>
        </div>
      </div>
    </aside>
  );
};
