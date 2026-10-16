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

export interface IpcEvents {
  'recording:start': (options: RecordingOptions) => void;
  'recording:stop': () => void;
  'recording:pause': () => void;
  'recording:resume': () => void;
  'recording:restart': () => void;
  'recording:cancel': () => void;
  'recording:state-changed': (state: 'idle' | 'countdown' | 'recording' | 'paused' | 'stopped') => void;
  'bubble:set-size': (size: BubbleSize) => void;
  'bubble:set-visible': (visible: boolean) => void;
  'drawing:toggle': () => void;
  'drawing:set-active': (active: boolean) => void;
  'drawing:clear': () => void;
  'sound:play': (sound: 'start' | 'stop' | 'pause' | 'complete' | 'countdown' | 'camera') => void;
}
