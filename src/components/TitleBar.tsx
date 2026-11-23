import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Minus, Square, X } from 'lucide-react';
import appLogo from '../assets/logo.svg';

export const TitleBar: React.FC = () => {
  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('window_minimize');
    } catch (err) {
      console.error('Minimize failed:', err);
    }
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('window_maximize');
    } catch (err) {
      console.error('Maximize failed:', err);
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('window_close');
    } catch (err) {
      console.error('Close failed:', err);
    }
  };

  return (
    <header className="custom-titlebar" data-tauri-drag-region>
      {/* Left Draggable Area with App Logo & Title */}
      <div className="titlebar-left" data-tauri-drag-region>
        <img src={appLogo} alt="AetherTree" className="titlebar-app-icon" data-tauri-drag-region />
        <span className="titlebar-app-title" data-tauri-drag-region>AetherTree</span>
      </div>

      {/* Right Controls: Native Window Controls (Min, Max, Close) */}
      <div className="titlebar-right">
        <button
          type="button"
          className="win-ctrl-btn"
          onClick={handleMinimize}
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="win-ctrl-btn"
          onClick={handleMaximize}
          title="Maximize"
        >
          <Square size={12} />
        </button>
        <button
          type="button"
          className="win-ctrl-btn win-close-btn"
          onClick={handleClose}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
};

