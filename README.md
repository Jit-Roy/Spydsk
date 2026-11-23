<div align="center">

<img src="src/assets/logo.svg" alt="DiskLens Logo" width="130" />

# DiskLens

### High-Performance Disk Space Analyzer & Storage Cleanup Studio for Windows

[![Platform](https://custom-icon-badges.demolab.com/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Jit-Roy/DiskLens)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Desktop-Tauri%20v2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/UI-React%2019-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Bundler-Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-222222?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-Jit--Roy%2FDiskLens-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Jit-Roy/DiskLens)

</div>

**DiskLens** is a blazing-fast, modern disk space analyzer and cleanup utility for Windows built with a multi-threaded **Rust core engine** and a native **Tauri v2 + React 19** frontend. Designed with a dark monochrome Windows 11 Fluent aesthetic, it traverses millions of files in milliseconds using low-level Win32 directory APIs and zero-allocation memory arenas, rendering an interactive squarified treemap alongside specialized developer and system storage reclaim tools.

---

## 📦 Prebuilt Release (Windows x64)

Download the standalone portable executable directly—no installer, no dependencies, 100% offline:

- **Executable**: `dist/DiskLens.exe` (Standalone 4.6 MB executable)
- **Releases**: [GitHub Releases](https://github.com/Jit-Roy/DiskLens/releases)

---

## 🚀 Running from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (1.77+)
- Windows Build Tools (Visual Studio C++ build tools)

### 1. Clone & Install
```bash
git clone https://github.com/Jit-Roy/DiskLens.git
cd DiskLens
npm install
```

### 2. Run in Development Mode
Launches the frontend Vite dev server and compiles the Rust backend with hot reloading:
```bash
npm run tauri dev
```

---

## 🔨 Building the Standalone Executable

To compile the optimized, single-file Windows `.exe` application with embedded offline frontend assets and native `.ico` resources:

```bash
npm run build:release
```

The compiled standalone executable will be output directly to:
```
dist/DiskLens.exe
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). Free and open source.
