/**
 * String and number formatters for recording duration, file size, timestamps, and resolutions
 */

export function formatDuration(ms: number): string {
  if (!ms || ms < 0 || isNaN(ms)) return '00:00';
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatDurationHuman(ms: number): string {
  if (!ms || ms < 0 || isNaN(ms)) return '0s';
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const unitIndex = Math.min(Math.max(0, i), units.length - 1);
  const size = bytes / Math.pow(1024, unitIndex);
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function getResolutionDimensions(res: '720p' | '1080p' | '4k'): { width: number; height: number } {
  switch (res) {
    case '720p':
      return { width: 1280, height: 720 };
    case '4k':
      return { width: 3840, height: 2160 };
    case '1080p':
    default:
      return { width: 1920, height: 1080 };
  }
}

export function getAspectRatio(width: number, height: number): string {
  if (!width || !height) return '16:9';
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(Math.round(width), Math.round(height));
  const ratioW = Math.round(width) / divisor;
  const ratioH = Math.round(height) / divisor;
  return `${ratioW}:${ratioH}`;
}

export function formatRelativeDate(timestampMs: number): string {
  if (!timestampMs || isNaN(timestampMs)) return '';
  const now = Date.now();
  const diffSecs = Math.max(0, Math.floor((now - timestampMs) / 1000));
  if (diffSecs < 60) return 'Agora mesmo';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `Há ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `Há ${diffDays} dias`;

  const d = new Date(timestampMs);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
