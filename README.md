# AetherTree — Modern High-Performance Disk Space Analyzer

A blazing-fast, modern disk space analyzer and cleanup utility built with **Rust (Engine)** and **Tauri v2 + React + TypeScript (UI)**. Designed with a dark monochrome Windows 11 Fluent aesthetic.

---

## ✨ Key Features

- **Ultra-Fast Multi-Threaded Disk Engine**:
  - Traverses entire drives with low-level Win32 directory APIs.
  - In-memory arena indexing with zero per-file heap allocation overhead.
  - Bottom-up post-order size and file count rollups computed in milliseconds.
- **Interactive Tree & File Explorer**:
  - Virtualized hierarchical directory tree with percentage-of-parent visual usage bars.
  - Drill down into folders with Chevron toggles and smooth folder expansion.
  - Instant live search and category filtering (All, Images, Videos, Archives, Documents, Others).
  - Context menu shortcuts (Open in File Explorer, Open File, Properties, Copy Path, Delete to Recycle Bin).
- **Comprehensive Clean Suite**:
  - **Quick Clean**: Safely scan and clean user/system temporary files, Windows update caches, crash dumps, and browser caches.
  - **Deep Clean**: Reclaim massive storage from previous Windows installations (`Windows.old`), driver packages, delivery optimization files, and Recycle Bin.
  - **Developer Cleaner**: Scan and purge heavy `node_modules`, Rust `target/`, and Python `.venv` build artifacts across your projects.
  - **Duplicates Finder**: Identify duplicate files wasting space by analyzing exact sizes and content hashes.
  - **Granular Folder Inspection**: Expand any category or project artifact to inspect and select specific subfolders/files for selective deletion.
- **Modern Dark Fluent Interface**:
  - Dark monochrome palette (`#0b0b0d`, `#141418`, `#26262e`, `#ffffff`, `#8e8e99`).
  - Animated live scanning progress, speed counter, and circular drive capacity gauge.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (1.77+)
- Windows Build Tools (Visual Studio C++ build tools)

### Development
Launch the app with hot reloading for both frontend and backend:
```bash
npm run tauri dev
```

### Production Build
Build the optimized standalone Windows `.exe` application:
```bash
npm run build
cargo build --release --manifest-path src-tauri/Cargo.toml
```

---

## 🛠️ Project Structure

```
├── src/                          # Modern React + Vite Frontend
│   ├── components/
│   │   ├── MainContentView.tsx   # File explorer tree/table & search views
│   │   ├── RightSidebar.tsx      # Drive info circular gauge & view switcher
│   │   ├── StorageSidebar.tsx    # Drive selector & cleaning tools navigation
│   │   └── TitleBar.tsx          # Custom dark window header
│   ├── App.tsx                   # Main layout, cleaning engines, and Tauri IPC
│   ├── App.css                   # Windows 11 Fluent dark theme styling
│   ├── types.ts                  # Shared TypeScript data models
│   ├── utils.ts                  # Formatting helpers
│   └── main.tsx                  # React entry point
├── src-tauri/                    # High-Performance Rust Core Engine
│   ├── src/
│   │   ├── commands.rs           # Tauri IPC commands & cleaning implementations
│   │   ├── fast_scanner.rs       # Win32 parallel directory scanner
│   │   ├── models.rs             # Core data structures & DTOs
│   │   ├── treemap.rs            # Squarified layout algorithm
│   │   ├── windows_drives.rs     # Win32 volume & drive detection
│   │   ├── lib.rs                # Tauri runtime handler registration
│   │   └── main.rs               # Rust executable entry point
│   ├── Cargo.toml                # Rust dependencies & optimization profiles
│   └── tauri.conf.json           # Tauri v2 configuration & window settings
├── package.json                  # Frontend dependencies & scripts
├── tsconfig.json                 # TypeScript compiler configuration
└── vite.config.ts                # Vite bundler configuration
```

---

## 📄 License

MIT License. Free and open source.
