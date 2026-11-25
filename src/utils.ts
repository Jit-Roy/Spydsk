let currentUnitFormat: 'adaptive' | 'iec' = 'adaptive';

export function setGlobalUnitFormat(format: 'adaptive' | 'iec') {
  currentUnitFormat = format;
}

export function formatBytes(bytes: number, format?: 'adaptive' | 'iec'): string {
  if (bytes === 0) return '0 B';
  const unit = format || currentUnitFormat;
  if (unit === 'iec') {
    const k = 1024;
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i >= sizes.length) return `${(bytes / Math.pow(k, sizes.length - 1)).toFixed(2)} ${sizes[sizes.length - 1]}`;
    const val = bytes / Math.pow(k, i);
    return `${val < 10 && i > 0 ? val.toFixed(2) : val.toFixed(1)} ${sizes[i]}`;
  } else {
    // Decimal Metric standard (1 KB = 1000 Bytes, 1 MB = 1000^2 Bytes, 1 GB = 1000^3 Bytes)
    const k = 1000;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    if (i >= sizes.length) return `${(bytes / Math.pow(k, sizes.length - 1)).toFixed(2)} ${sizes[sizes.length - 1]}`;
    const val = bytes / Math.pow(k, i);
    return `${val < 10 && i > 0 ? val.toFixed(2) : val.toFixed(1)} ${sizes[i]}`;
  }
}

export function formatDate(timestampSec: number): string {
  if (!timestampSec) return '-';
  const d = new Date(timestampSec * 1000);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
