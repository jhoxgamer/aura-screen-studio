/**
 * Studio Keyboard Shortcuts & Platform Adaptation Utility
 * Normalizes accelerators between macOS (Cmd/⌘) and Windows/Linux (Ctrl)
 */

export const isMacPlatform = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent);
};

export const getModifierLabel = (): string => {
  return isMacPlatform() ? 'Cmd' : 'Ctrl';
};

export const getShortcutLabel = (key: string): string => {
  const mod = getModifierLabel();
  return `${mod}+Shift+${key.toUpperCase()}`;
};

export const STUDIO_SHORTCUTS = {
  TOGGLE_RECORDING: 'A',
  TOGGLE_RECORDING_LOOM: 'L',
  PAUSE_RESUME: 'P',
  TOGGLE_MIC: 'M',
  TOGGLE_DRAWING: 'D',
  TOGGLE_PROMPTER: 'T',
  SCREENSHOT: 'S',
  SHARE_LINK: 'L'
} as const;
