<div align="center">

<img src="src/assets/logo.svg" alt="Spydsk Logo" width="160" />

<br />

<img src="src/assets/spydsk_title.svg" alt="Spydsk" width="210" />

[![Platform](https://custom-icon-badges.demolab.com/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Jit-Roy/Spydsk)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Desktop-Tauri%20v2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/UI-React%2019-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Bundler-Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![WebView2](https://img.shields.io/badge/Renderer-WebView2-0078D7?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
[![License](https://img.shields.io/badge/License-MIT-222222?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-Jit--Roy%2FSpydsk-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Jit-Roy/Spydsk)

</div>

**Spydsk** is a Windows disk space analyzer and storage cleanup studio built with a multi-threaded Rust scanning engine and a dark monochrome Tauri v2 + React interface. It traverses drives quickly using native Win32 file enumeration APIs and provides interactive Tree and Flat File explorers, category and instant minimum-size cache filtering, Quick Clean, Dev Cleaner, Duplicate Finder, Deep Clean, and Space Saver (ZIP archival and native NTFS LZX compaction), along with Protected Paths safeguards and configurable decimal or binary IEC size units.

---

## Prebuilt Release (Windows x64)

Download the prebuilt standalone executable directly and run `Spydsk.exe`:

- **All Releases:** [GitHub Releases](https://github.com/Jit-Roy/Spydsk/releases)

## Running from Source

```bash
git clone https://github.com/Jit-Roy/Spydsk.git
cd Spydsk
npm install
npm run tauri dev
```

## Building the Executable

With Node.js (v18+) and Rust (1.77+) installed, bundle the standalone Windows build using Tauri:

```bash
npm run build:release
```

The built application will be output to `dist\Spydsk.exe`.

## Settings & Cache Location

Spydsk stores persistent preferences in local WebView2 storage under Windows Local AppData (`%LOCALAPPDATA%\com.spydsk.desktop\EBWebView`, i.e., `C:\Users\<Username>\AppData\Local\com.spydsk.desktop\EBWebView`):

- `spydsk_settings` (`localStorage`) — Hidden and system file visibility, junction/symlink skipping, Adaptive/IEC display units, minimum file size filter, and Protected Paths ignore list
