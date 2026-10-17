import { contextBridge, ipcRenderer } from 'electron';
import { BubbleSize, RecordingOptions, RecordingMeta, CropArea } from './types';

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
  getPublicUrl: async (): Promise<string | null> => {
    return await ipcRenderer.invoke('share:get-public-url');
  },
  getServerPort: async (): Promise<number> => {
    return await ipcRenderer.invoke('share:get-server-port');
  },
  updateTitle: async (id: string, newTitle: string): Promise<boolean> => {
    return await ipcRenderer.invoke('recordings:update-title', id, newTitle);
  },
  updateChapters: async (id: string, chapters: any[]): Promise<boolean> => {
    return await ipcRenderer.invoke('recordings:update-chapters', id, chapters);
  },
  downloadRecording: async (id: string): Promise<boolean> => {
    return await ipcRenderer.invoke('recordings:download', id);
  },
  trimRecording: async (id: string, bufferOrOptions: any, newDurationMs?: number): Promise<any> => {
    return await ipcRenderer.invoke('recordings:trim', id, bufferOrOptions, newDurationMs);
  },
  openPreview: (idOrMeta: string | RecordingMeta) => {
    ipcRenderer.send('recordings:open-preview', idOrMeta);
  },
  openPreRecording: () => {
    ipcRenderer.send('window:open-pre-recording');
  },
  openExternalUrl: (url: string) => {
    ipcRenderer.send('window:open-external', url);
  },
  toggleSpeakerNotes: () => {
    ipcRenderer.send('speaker-notes:toggle');
  },
  resizeSpeakerNotes: (width: number, height: number) => {
    ipcRenderer.send('speaker-notes:resize', width, height);
  },
  dockSpeakerNotes: (target: 'top-center' | 'near-camera') => {
    ipcRenderer.send('speaker-notes:dock', target);
  },
  setSpeakerNotesIgnoreMouse: (ignore: boolean) => {
    ipcRenderer.send('speaker-notes:set-ignore-mouse', ignore);
  },
  onSpeakerNotesStateChanged: (callback: (isOpen: boolean) => void) => {
    const handler = (_: any, isOpen: boolean) => callback(isOpen);
    ipcRenderer.on('speaker-notes:state-changed', handler);
    return () => ipcRenderer.removeListener('speaker-notes:state-changed', handler);
  },
  startCropSelection: () => {
    ipcRenderer.send('crop:start-selection');
  },
  sendCropArea: (area: CropArea) => {
    ipcRenderer.send('crop:area-selected', area);
  },
  cancelCropSelection: () => {
    ipcRenderer.send('crop:cancel-selection');
  },
  takeScreenshot: () => {
    ipcRenderer.send('screenshot:take');
  },
  copyScreenshotToClipboard: async (dataUrl: string): Promise<boolean> => {
    return await ipcRenderer.invoke('screenshot:copy-clipboard', dataUrl);
  },
  saveScreenshotFile: async (dataUrl: string): Promise<string> => {
    return await ipcRenderer.invoke('screenshot:save-file', dataUrl);
  },
  onScreenshotData: (callback: (dataUrl: string) => void) => {
    const handler = (_: any, dataUrl: string) => callback(dataUrl);
    ipcRenderer.on('screenshot:data', handler);
    return () => ipcRenderer.removeListener('screenshot:data', handler);
  },

  // Auto-Updater
  checkForUpdates: async () => {
    return await ipcRenderer.invoke('updater:check');
  },
  getAppVersion: async (): Promise<string> => {
    return await ipcRenderer.invoke('updater:get-version');
  },
  startUpdateDownload: () => {
    ipcRenderer.send('updater:start-download');
  },
  installUpdateNow: () => {
    ipcRenderer.send('updater:install-now');
  },
  onUpdateStatusChanged: (callback: (status: { state: string; version?: string; percent?: number; releaseNotes?: string }) => void) => {
    const handler = (_: any, status: any) => callback(status);
    ipcRenderer.on('updater:status-changed', handler);
    return () => ipcRenderer.removeListener('updater:status-changed', handler);
  },
  onUpdateProgress: (callback: (percent: number) => void) => {
    const handler = (_: any, pct: number) => callback(pct);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
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
  onToggleMic: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('recording:toggle-mic', handler);
    return () => ipcRenderer.removeListener('recording:toggle-mic', handler);
  },
  onCountdownTick: (callback: (count: number) => void) => {
    const handler = (_: any, count: number) => callback(count);
    ipcRenderer.on('countdown:tick', handler);
    return () => ipcRenderer.removeListener('countdown:tick', handler);
  },
  onCountdownInit: (callback: (data: { total: number; current: number }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('countdown:init', handler);
    return () => ipcRenderer.removeListener('countdown:init', handler);
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
  },

  // Zoom-Style Live Screen Sharing
  startLiveShare: async (title?: string) => {
    return await ipcRenderer.invoke('live-share:start', title);
  },
  stopLiveShare: async () => {
    return await ipcRenderer.invoke('live-share:stop');
  },
  togglePauseLiveShare: async () => {
    return await ipcRenderer.invoke('live-share:toggle-pause');
  },
  getLiveStatus: async () => {
    return await ipcRenderer.invoke('live-share:get-status');
  },
  getLiveUrls: async () => {
    return await ipcRenderer.invoke('live-share:get-urls');
  },
  sendLiveFrame: (buffer: ArrayBuffer) => {
    ipcRenderer.send('live-share:broadcast-frame', buffer);
  },
  onLiveViewersChanged: (callback: (count: number) => void) => {
    const handler = (_: any, count: number) => callback(count);
    ipcRenderer.on('live-share:viewers-changed', handler);
    return () => ipcRenderer.removeListener('live-share:viewers-changed', handler);
  },
  onLiveReactionReceived: (callback: (reaction: { emoji: string; author?: string; time: number }) => void) => {
    const handler = (_: any, r: any) => callback(r);
    ipcRenderer.on('live-share:reaction-received', handler);
    return () => ipcRenderer.removeListener('live-share:reaction-received', handler);
  },
  onLiveQuestionReceived: (callback: (q: { text: string; author?: string; time: number }) => void) => {
    const handler = (_: any, q: any) => callback(q);
    ipcRenderer.on('live-share:question-received', handler);
    return () => ipcRenderer.removeListener('live-share:question-received', handler);
  },
  onLiveStatusChanged: (callback: (status: any) => void) => {
    const handler = (_: any, status: any) => callback(status);
    ipcRenderer.on('live-share:status-changed', handler);
    return () => ipcRenderer.removeListener('live-share:status-changed', handler);
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
