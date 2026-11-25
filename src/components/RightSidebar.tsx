import React from 'react';
import { HardDrive } from 'lucide-react';
import { DriveInfo } from '../types';
import { formatBytes } from '../utils';

interface RightSidebarProps {
  currentDrive?: DriveInfo;
  totalBytesScanned: number;
  isScanned: boolean;
  scanUnitFormat?: 'adaptive' | 'iec';
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  currentDrive,
  totalBytesScanned,
  isScanned,
  scanUnitFormat,
}) => {
  const totalBytes = currentDrive?.total_bytes || 181.7 * 1024 ** 3;
  const usedBytes = currentDrive?.used_bytes || 0;
  const freeBytes = currentDrive?.free_bytes || Math.max(0, totalBytes - usedBytes);

  const percentUsed = currentDrive?.percent_used != null
    ? currentDrive.percent_used
    : totalBytes > 0
      ? Math.min(100, Math.max(0, (usedBytes / totalBytes) * 100))
      : 0;

  // Donut Gauge SVG calculations
  const radius = 45;
  const strokeWidth = 9;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentUsed / 100) * circumference;

  return (
    <aside className="right-storage-sidebar">
      {/* Drive Info Card Box */}
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
            <span className="metric-val">{formatBytes(usedBytes, scanUnitFormat)}</span>
          </div>

          <div className="stats-metric-row">
            <div className="stats-metric-left">
              <span className="legend-dot free-dot" />
              <span className="metric-label">Free Space</span>
            </div>
            <span className="metric-val">{formatBytes(freeBytes, scanUnitFormat)}</span>
          </div>

          {isScanned && totalBytesScanned > 0 && (
            <div className="stats-metric-row">
              <div className="stats-metric-left">
                <span className="legend-dot" style={{ backgroundColor: '#a1a1aa' }} />
                <span className="metric-label">Scanned Match</span>
              </div>
              <span className="metric-val">{formatBytes(totalBytesScanned, scanUnitFormat)}</span>
            </div>
          )}

          <div className="stats-total-box">
            <span className="total-label">Total Space</span>
            <span className="total-val">{formatBytes(totalBytes, scanUnitFormat)}</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
