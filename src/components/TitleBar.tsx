import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, Copy, X } from 'lucide-react';
import appLogo from '../assets/logo.svg';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const checkMaximized = async () => {
      try {
        const appWindow = getCurrentWindow();
        setIsMaximized(await appWindow.isMaximized());
        unlisten = await appWindow.onResized(async () => {
          setIsMaximized(await appWindow.isMaximized());
        });
      } catch (err) {
        console.error('Failed to listen to window resize:', err);
      }
    };
    checkMaximized();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

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
      const appWindow = getCurrentWindow();
      setIsMaximized(await appWindow.isMaximized());
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

  const handleTitleBarDoubleClick = async () => {
    try {
      await invoke('window_maximize');
      const appWindow = getCurrentWindow();
      setIsMaximized(await appWindow.isMaximized());
    } catch (err) {
      console.error('Titlebar double click failed:', err);
    }
  };

  return (
    <header className="custom-titlebar">
      {/* Draggable Area with App Logo */}
      <div
        className="titlebar-left"
        data-tauri-drag-region
        onDoubleClick={handleTitleBarDoubleClick}
      >
        <img src={appLogo} alt="Spydsk" className="titlebar-app-icon" data-tauri-drag-region />
      </div>

      {/* Right Controls: Native Window Controls (Min, Max, Close) */}
      <div className="titlebar-right" data-tauri-drag-region="false">
        <button
          type="button"
          className="win-ctrl-btn"
          onClick={handleMinimize}
          title="Minimize"
          data-tauri-drag-region="false"
        >
          <Minus size={14} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="win-ctrl-btn"
          onClick={handleMaximize}
          title={isMaximized ? "Restore Down" : "Maximize"}
          data-tauri-drag-region="false"
        >
          {isMaximized ? (
            <Copy size={11} strokeWidth={1.5} />
          ) : (
            <Square size={12} strokeWidth={1.5} />
          )}
        </button>
        <button
          type="button"
          className="win-ctrl-btn win-close-btn"
          onClick={handleClose}
          title="Close"
          data-tauri-drag-region="false"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </header>
  );
};

