export type RecordingMode = 'screen-cam' | 'screen-only' | 'cam-only';
export type BubbleSize = 'small' | 'medium' | 'large' | 'fullscreen';

export interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string;
  display_id?: string;
  appIcon?: string;
}

export interface RecordingOptions {
  mode: RecordingMode;
  sourceId: string;
  audioDeviceId: string;
  videoDeviceId: string;
  includeSystemAudio: boolean;
  resolution: '720p' | '1080p' | '4k';
  fps: number;
}

export interface RecordingMeta {
  id: string;
  title: string;
  createdAt: number;
  durationMs: number;
  filePath: string;
  fileSize: number;
  thumbnailUrl?: string;
  resolution: string;
}

declare global {
  interface Window {
    electronAPI: {
      getSources: () => Promise<CaptureSource[]>;
      startRecording: (options: RecordingOptions) => void;
      stopRecording: () => void;
      pauseRecording: () => void;
      resumeRecording: () => void;
      restartRecording: () => void;
      cancelRecording: () => void;
      setBubbleSize: (size: BubbleSize) => void;
      setBubbleVisible: (visible: boolean) => void;
      toggleDrawing: () => void;
      setDrawingActive: (active: boolean) => void;
      clearDrawing: () => void;
      playSound: (sound: 'start' | 'stop' | 'pause' | 'complete' | 'countdown' | 'camera') => void;
      saveRecording: (buffer: ArrayBuffer, meta: Omit<RecordingMeta, 'id' | 'filePath' | 'fileSize'>) => Promise<RecordingMeta>;
      getRecordings: () => Promise<RecordingMeta[]>;
      deleteRecording: (id: string) => Promise<boolean>;
      openFileFolder: (filePath: string) => void;
      closeCurrentWindow: () => void;
      minimizeCurrentWindow: () => void;
      onRecordingStateChanged: (callback: (state: string) => void) => () => void;
      onCountdownTick: (callback: (count: number) => void) => () => void;
      onBubbleSizeChanged: (callback: (size: BubbleSize) => void) => () => void;
      onDrawingToggled: (callback: (active: boolean) => void) => () => void;
      onPlaySound: (callback: (sound: string) => void) => () => void;
      onOpenPreview: (callback: (meta: RecordingMeta) => void) => () => void;
      onRecordingOptions: (callback: (options: RecordingOptions) => void) => () => void;
    };
  }
}
