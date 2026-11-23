import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('src-tauri/target/release/aethertree.exe');
const distDir = path.resolve('dist');
const dest = path.resolve('dist/AetherTree.exe');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  const stats = fs.statSync(dest);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\x1b[32m✓ Release binary successfully created:\x1b[0m dist/AetherTree.exe (${sizeMb} MB)`);
} else {
  console.error(`\x1b[31m✗ Could not find release binary at:\x1b[0m ${src}`);
  process.exit(1);
}
