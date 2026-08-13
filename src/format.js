// Small display formatters shared across tools.

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Human byte counts: 900 B, 1.4 KB, 12.8 MB. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  let value = Math.abs(bytes);
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) { value /= 1024; unit++; }
  const decimals = unit === 0 || value >= 100 ? 0 : 1;
  return `${bytes < 0 ? '-' : ''}${value.toFixed(decimals)} ${BYTE_UNITS[unit]}`;
}

/** A signed percentage change, e.g. "−32%" going from 100 to 68. */
export function formatDelta(before, after) {
  if (!before) return '—';
  const change = ((after - before) / before) * 100;
  return `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}%`;
}
