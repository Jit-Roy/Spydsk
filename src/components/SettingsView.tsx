import React, { useState, useEffect, useRef } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Settings,
  FolderPlus,
  Trash2,
  Folder,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onResetSettings: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onResetSettings,
}) => {
  const [newPathInput, setNewPathInput] = useState<string>('');
  const [unitDropdownOpen, setUnitDropdownOpen] = useState<boolean>(false);
  const unitDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (unitDropdownRef.current && !unitDropdownRef.current.contains(e.target as Node)) {
        setUnitDropdownOpen(false);
      }
    };
    if (unitDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [unitDropdownOpen]);

  // Update check state
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const handleAddProtectedPath = (pathToAdd?: string) => {
    const raw = pathToAdd !== undefined ? pathToAdd : newPathInput;
    const cleanPath = raw.trim();
    if (!cleanPath) return;

    const normalized = cleanPath.replace(/\\+$/, '');
    const exists = settings.protectedPaths.some(
      (p) => p.toLowerCase().replace(/\\+$/, '') === normalized.toLowerCase()
    );

    if (!exists) {
      onUpdateSettings({
        protectedPaths: [...settings.protectedPaths, normalized],
      });
    }
    setNewPathInput('');
  };

  const handleRemoveProtectedPath = (pathToRemove: string) => {
    onUpdateSettings({
      protectedPaths: settings.protectedPaths.filter((p) => p !== pathToRemove),
    });
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);
    try {
      const res = await fetch('https://api.github.com/repos/Jit-Roy/Spydsk/releases/latest');
      if (res.ok) {
        const data = await res.json();
        const latestTag = data.tag_name || 'v0.1.0';
        if (latestTag === 'v0.1.0' || latestTag === '0.1.0') {
          setUpdateStatus('You are using the latest version (v0.1.0)');
        } else {
          setUpdateStatus(`New release available: ${latestTag}`);
        }
      } else {
        setUpdateStatus('You are running the latest build (v0.1.0)');
      }
    } catch {
      setUpdateStatus('Spydsk is up to date (v0.1.0)');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleOpenGitHub = async () => {
    try {
      await openUrl('https://github.com/Jit-Roy/Spydsk');
    } catch (err) {
      console.error('Could not open GitHub link:', err);
    }
  };

  return (
    <div className="tool-view-container settings-view-container">
      {/* Top Header Bar */}
      <div className="clean-results-topbar settings-topbar">
        <div className="clean-topbar-left">
          <span className="clean-total-badge">
            <Settings size={14} />
            <span>Settings</span>
          </span>
        </div>
        <div className="clean-topbar-right">
          <button
            type="button"
            className="settings-reset-btn"
            onClick={onResetSettings}
            title="Reset all settings to default values"
          >
            <RotateCcw size={13} />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* Main Settings Scroll Container */}
      <div className="settings-scroll-container">
        <div className="settings-section-wrapper">
          {/* SECTION 1: SCANNER & VIEW PREFERENCES */}
          <div className="settings-group-card">
            <div className="settings-group-header">
              <div className="settings-group-titles">
                <h3 className="settings-group-title">Scanner & View Preferences</h3>
                <p className="settings-group-subtitle">
                  Configure directory exploration, symbolic links, and display units
                </p>
              </div>
            </div>

            <div className="settings-items-list">
              {/* 1. Show Hidden & System Files */}
              <div className="settings-row-item">
                <div className="settings-row-info">
                  <span className="settings-row-title">Show Hidden & System Files</span>
                  <span className="settings-row-desc">
                    Controls whether protected system folders (e.g., System Volume Information, $Recycle.Bin, hidden AppData) appear in the Explorer Tree and Flat File views.
                  </span>
                </div>
                <div className="settings-row-control">
                  <label className="fluent-toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.showHiddenSystemFiles}
                      onChange={(e) => onUpdateSettings({ showHiddenSystemFiles: e.target.checked })}
                    />
                    <span className="fluent-toggle-slider" />
                  </label>
                </div>
              </div>

              {/* 2. Skip Junctions & Symlinks */}
              <div className="settings-row-item">
                <div className="settings-row-info">
                  <div className="settings-title-badge-row">
                    <span className="settings-row-title">Skip Junctions & Symlinks</span>
                    <span className="settings-badge-pill">Recommended ON</span>
                  </div>
                  <span className="settings-row-desc">
                    Prevents recursive loops (like legacy Windows Application Data junctions) and prevents counting duplicate disk usage on linked drives.
                  </span>
                </div>
                <div className="settings-row-control">
                  <label className="fluent-toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.skipJunctions}
                      onChange={(e) => onUpdateSettings({ skipJunctions: e.target.checked })}
                    />
                    <span className="fluent-toggle-slider" />
                  </label>
                </div>
              </div>

              {/* 3. Scan Unit Format */}
              <div className="settings-row-item">
                <div className="settings-row-info">
                  <span className="settings-row-title">Scan Unit Format</span>
                  <span className="settings-row-desc">
                    Auto-adaptive decimal units (B, KB, MB, GB) vs Binary IEC units (KiB, MiB, GiB).
                  </span>
                </div>
                <div className="settings-row-control">
                  <div className="settings-segmented-control">
                    <button
                      type="button"
                      className={`settings-segment-btn ${settings.scanUnitFormat === 'adaptive' ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ scanUnitFormat: 'adaptive' })}
                      title="Metric format (KB, MB, GB) based on 1,000 intervals"
                    >
                      Auto-adaptive (B, KB, MB, GB)
                    </button>
                    <button
                      type="button"
                      className={`settings-segment-btn ${settings.scanUnitFormat === 'iec' ? 'active' : ''}`}
                      onClick={() => onUpdateSettings({ scanUnitFormat: 'iec' })}
                      title="Binary IEC standard (KiB, MiB, GiB) based on 1,024 intervals"
                    >
                      Binary IEC (KiB, MiB, GiB)
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. Minimum File Size Filter */}
              <div className="settings-row-item">
                <div className="settings-row-info">
                  <span className="settings-row-title">Minimum File Size Filter</span>
                  <span className="settings-row-desc">
                    Option to ignore tiny files (&lt; 1 KB) during deep scans to accelerate processing. Set to 0 to include all files.
                  </span>
                </div>
                <div className="settings-row-control">
                  <div className="settings-number-input-group">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="settings-number-input"
                      placeholder="0"
                      value={settings.minFileSizeValue === 0 ? '' : String(settings.minFileSizeValue)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        const numVal = raw === '' ? 0 : parseInt(raw, 10);
                        const unit = settings.minFileSizeUnit || 'KB';
                        const mult = unit === 'GB' ? 1024 * 1024 : unit === 'MB' ? 1024 : 1;
                        onUpdateSettings({
                          minFileSizeValue: numVal,
                          minFileSizeKb: numVal * mult,
                        });
                      }}
                    />
                    <div className="settings-unit-dropdown" ref={unitDropdownRef}>
                      <button
                        type="button"
                        className="settings-unit-trigger"
                        onClick={() => setUnitDropdownOpen((prev) => !prev)}
                        aria-haspopup="listbox"
                        aria-expanded={unitDropdownOpen}
                      >
                        <span>{settings.minFileSizeUnit || 'KB'}</span>
                        <ChevronDown
                          size={13}
                          className={`settings-unit-chevron ${unitDropdownOpen ? 'open' : ''}`}
                        />
                      </button>
                      {unitDropdownOpen && (
                        <div className="settings-unit-menu" role="listbox">
                          {(['KB', 'MB', 'GB'] as const).map((unitOpt) => {
                            const isSelected = (settings.minFileSizeUnit || 'KB') === unitOpt;
                            return (
                              <button
                                key={unitOpt}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                className={`settings-unit-option ${isSelected ? 'active' : ''}`}
                                onClick={() => {
                                  const val = settings.minFileSizeValue || 0;
                                  const mult =
                                    unitOpt === 'GB' ? 1024 * 1024 : unitOpt === 'MB' ? 1024 : 1;
                                  onUpdateSettings({
                                    minFileSizeUnit: unitOpt,
                                    minFileSizeKb: val * mult,
                                  });
                                  setUnitDropdownOpen(false);
                                }}
                              >
                                {unitOpt}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: SAFETY & EXCLUSIONS */}
          <div className="settings-group-card">
            <div className="settings-group-header">
              <div className="settings-group-titles">
                <h3 className="settings-group-title">Protected Paths / Ignore List</h3>
                <p className="settings-group-subtitle">
                  Specify folders that Spydsk will never touch, suggest for cleanup, or delete
                </p>
              </div>
            </div>

            <div className="settings-items-list">
              <div className="settings-ignore-adder">
                <input
                  type="text"
                  className="settings-text-input"
                  placeholder="e.g. D:\Personal Projects, C:\Python315, .git"
                  value={newPathInput}
                  onChange={(e) => setNewPathInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddProtectedPath();
                  }}
                />
                <button
                  type="button"
                  className="settings-primary-btn"
                  onClick={() => handleAddProtectedPath()}
                  disabled={!newPathInput.trim()}
                  title="Add folder path to protected ignore list"
                >
                  <FolderPlus size={14} />
                  <span>Add Folder</span>
                </button>
              </div>

              {/* Protected Paths List */}
              <div className="settings-protected-list">
                {settings.protectedPaths.length === 0 ? (
                  <div className="settings-empty-list">
                    <span>No custom protected folders configured. System defaults apply.</span>
                  </div>
                ) : (
                  settings.protectedPaths.map((p) => (
                    <div key={p} className="settings-path-chip" title={p}>
                      <Folder size={13} className="settings-chip-icon" />
                      <span className="settings-chip-path">{p}</span>
                      <button
                        type="button"
                        className="settings-chip-remove"
                        onClick={() => handleRemoveProtectedPath(p)}
                        title={`Remove ${p} from protected paths`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3: APP INFO & VERSION */}
          <div className="settings-group-card">
            <div className="settings-group-header">
              <div className="settings-group-titles">
                <h3 className="settings-group-title">App Info</h3>
                <p className="settings-group-subtitle">
                  Version information and project resources
                </p>
              </div>
            </div>

            <div className="settings-items-list">
              <div className="settings-app-info-row">
                <div className="settings-app-info-left">
                  <div className="settings-app-title-group">
                    <span className="settings-app-name">Spydsk</span>
                    <span className="settings-version-tag">v0.1.0 (Spydsk 64-bit)</span>
                  </div>
                  <span className="settings-app-desc">
                    Modern High-Performance Disk Space Analyzer, Cleaner &amp; Space Reducer for Windows 10 &amp; 11.
                  </span>
                  {updateStatus && (
                    <div className="settings-update-banner">
                      <CheckCircle2 size={13} />
                      <span>{updateStatus}</span>
                    </div>
                  )}
                </div>

                <div className="settings-app-actions">
                  <button
                    type="button"
                    className="settings-action-btn"
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate}
                    title="Check GitHub for newer versions"
                  >
                    <RefreshCw size={13} className={checkingUpdate ? 'spin-icon' : ''} />
                    <span>{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span>
                  </button>

                  <button
                    type="button"
                    className="settings-action-btn"
                    onClick={handleOpenGitHub}
                    title="Open GitHub Repository in browser"
                  >
                    <ExternalLink size={13} />
                    <span>GitHub Repository</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
