import React from 'react';
import { HardDrive, GitFork, Menu } from 'lucide-react';
import { DriveInfo } from '../types';
import { formatBytes } from '../utils';

interface RightSidebarProps {
  currentDrive?: DriveInfo;
  totalBytesScanned: number;
  isScanned: boolean;
  activeView: 'tree' | 'file';
  onSelectView: (view: 'tree' | 'file') => void;
  showViewToggle?: boolean;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  currentDrive,
  totalBytesScanned,
  isScanned,
  activeView,
  onSelectView,
  showViewToggle = true,
}) => {
  const totalBytes = currentDrive?.total_bytes || 181.7 * 1024 ** 3;
  const usedBytes = isScanned
    ? totalBytesScanned || currentDrive?.used_bytes || 0
    : currentDrive?.used_bytes || 0;
  const freeBytes = isScanned
    ? Math.max(0, totalBytes - usedBytes)
    : currentDrive?.free_bytes || totalBytes;

  const percentUsed = totalBytes > 0
    ? Math.min(100, Math.max(0, (usedBytes / totalBytes) * 100))
    : 0;

  // Donut Gauge SVG calculations
  const radius = 45;
  const strokeWidth = 9;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentUsed / 100) * circumference;

  return (
    <aside className="right-storage-sidebar">
      {/* 0. Top View Switcher: Tree View / File View */}
      {showViewToggle && (
        <div className="right-sidebar-view-toggle">
          <div className="view-toggle-pill">
            <button
              type="button"
              className={`view-pill-btn ${activeView === 'tree' ? 'active' : ''}`}
              onClick={() => onSelectView('tree')}
              title="Tree View"
            >
              <GitFork size={13} className="view-icon" />
              <span>Tree View</span>
            </button>
            <button
              type="button"
              className={`view-pill-btn ${activeView === 'file' ? 'active' : ''}`}
              onClick={() => onSelectView('file')}
              title="File View"
            >
              <Menu size={13} className="view-icon" />
              <span>File View</span>
            </button>
          </div>
        </div>
      )}

      {/* 1. Drive Info Card Box */}
      <div className="right-drive-info-card">
        {/* Header: Drive Info */}
        <div className="right-sidebar-header">
          <HardDrive size={16} className="drive-info-icon" />
          <span className="drive-info-title">Drive Info</span>
        </div>

        {/* Donut Gauge Container */}
        <div className="right-gauge-container">
          <div className="donut-wrapper">
            <svg className="donut-svg" width="120" height="120" viewBox="0 0 110 110">
              <circle
                className="donut-track"
                cx="55"
                cy="55"
                r={radius}
                strokeWidth={strokeWidth}
              />
              <circle
                className="donut-fill"
                cx="55"
                cy="55"
                r={radius}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="donut-center-content">
              <span className="donut-pct">{percentUsed.toFixed(1)}%</span>
              <span className="donut-sublabel">Used</span>
            </div>
          </div>
        </div>

        {/* Space Stats Breakdown */}
        <div className="right-stats-section">
          <div className="stats-metric-row">
            <div className="stats-metric-left">
              <span className="legend-dot used-dot" />
              <span className="metric-label">Used Space</span>
            </div>
            <span className="metric-val">{formatBytes(usedBytes)}</span>
          </div>

          <div className="stats-metric-row">
            <div className="stats-metric-left">
              <span className="legend-dot free-dot" />
              <span className="metric-label">Free Space</span>
            </div>
            <span className="metric-val">{formatBytes(freeBytes)}</span>
          </div>

          <div className="stats-total-box">
            <span className="total-label">Total Space</span>
            <span className="total-val">{formatBytes(totalBytes)}</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
