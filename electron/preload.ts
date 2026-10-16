import { contextBridge, ipcRenderer } from 'electron';
import { BubbleSize, RecordingOptions, RecordingMeta } from './types';

export const electronAPI = {
  // Capture Sources (Screens & Windows)
  getSources: async () => {
    return await ipcRenderer.invoke('capturer:get-sources');
  },

  // Recording Controls
  startRecording: (options: RecordingOptions) => {
    ipcRenderer.send('recording:start', options);
  },
  stopRecording: () => {
    ipcRenderer.send('recording:stop');
  },
  pauseRecording: () => {
    ipcRenderer.send('recording:pause');
  },
  resumeRecording: () => {
    ipcRenderer.send('recording:resume');
  },
  restartRecording: () => {
    ipcRenderer.send('recording:restart');
  },
  cancelRecording: () => {
    ipcRenderer.send('recording:cancel');
  },

  // Camera Bubble controls
  setBubbleSize: (size: BubbleSize) => {
    ipcRenderer.send('bubble:set-size', size);
  },
  setBubbleVisible: (visible: boolean) => {
    ipcRenderer.send('bubble:set-visible', visible);
  },

  // Drawing overlay controls
  toggleDrawing: () => {
    ipcRenderer.send('drawing:toggle');
  },
  setDrawingActive: (active: boolean) => {
    ipcRenderer.send('drawing:set-active', active);
  },
  clearDrawing: () => {
    ipcRenderer.send('drawing:clear');
  },

  // Audio cues
  playSound: (sound: 'start' | 'stop' | 'pause' | 'complete' | 'countdown' | 'camera') => {
    ipcRenderer.send('sound:play', sound);
  },

  // Storage and Recording management
  saveRecording: async (buffer: ArrayBuffer, meta: Omit<RecordingMeta, 'id' | 'filePath' | 'fileSize'>): Promise<RecordingMeta> => {
    return await ipcRenderer.invoke('recordings:save', buffer, meta);
  },
  getRecordings: async (): Promise<RecordingMeta[]> => {
    return await ipcRenderer.invoke('recordings:list');
  },
  deleteRecording: async (id: string): Promise<boolean> => {
    return await ipcRenderer.invoke('recordings:delete', id);
  },
  openFileFolder: (filePath: string) => {
    ipcRenderer.send('recordings:open-folder', filePath);
  },
  getShareUrl: async (id: string): Promise<string> => {
    return await ipcRenderer.invoke('recordings:get-share-url', id);
  },
  openExternalUrl: (url: string) => {
    ipcRenderer.send('window:open-external', url);
  },
  toggleSpeakerNotes: () => {
    ipcRenderer.send('speaker-notes:toggle');
  },
  startCropSelection: () => {
    ipcRenderer.send('crop:start-selection');
  },

  // Window Controls
  closeCurrentWindow: () => {
    ipcRenderer.send('window:close-current');
  },
  minimizeCurrentWindow: () => {
    ipcRenderer.send('window:minimize-current');
  },

  // Listeners
  onRecordingStateChanged: (callback: (state: string) => void) => {
    const handler = (_: any, state: string) => callback(state);
    ipcRenderer.on('recording:state-changed', handler);
    return () => ipcRenderer.removeListener('recording:state-changed', handler);
  },
  onCountdownTick: (callback: (count: number) => void) => {
    const handler = (_: any, count: number) => callback(count);
    ipcRenderer.on('countdown:tick', handler);
    return () => ipcRenderer.removeListener('countdown:tick', handler);
  },
  onBubbleSizeChanged: (callback: (size: BubbleSize) => void) => {
    const handler = (_: any, size: BubbleSize) => callback(size);
    ipcRenderer.on('bubble:size-changed', handler);
    return () => ipcRenderer.removeListener('bubble:size-changed', handler);
  },
  onDrawingToggled: (callback: (active: boolean) => void) => {
    const handler = (_: any, active: boolean) => callback(active);
    ipcRenderer.on('drawing:toggled', handler);
    return () => ipcRenderer.removeListener('drawing:toggled', handler);
  },
  onPlaySound: (callback: (sound: string) => void) => {
    const handler = (_: any, sound: string) => callback(sound);
    ipcRenderer.on('sound:play-client', handler);
    return () => ipcRenderer.removeListener('sound:play-client', handler);
  },
  onOpenPreview: (callback: (recordingMeta: RecordingMeta) => void) => {
    const handler = (_: any, meta: RecordingMeta) => callback(meta);
    ipcRenderer.on('preview:open', handler);
    return () => ipcRenderer.removeListener('preview:open', handler);
  },
  onRecordingOptions: (callback: (options: RecordingOptions) => void) => {
    const handler = (_: any, options: RecordingOptions) => callback(options);
    ipcRenderer.on('recording:options', handler);
    return () => ipcRenderer.removeListener('recording:options', handler);
  },
  onCropAreaSelected: (callback: (area: any) => void) => {
    const handler = (_: any, area: any) => callback(area);
    ipcRenderer.on('crop:area-selected', handler);
    return () => ipcRenderer.removeListener('crop:area-selected', handler);
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
