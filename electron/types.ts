export type RecordingMode = 'screen-cam' | 'screen-only' | 'cam-only' | 'custom-area';

export type BubbleSize = 'small' | 'medium' | 'large' | 'fullscreen';

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  speakerNotesEnabled?: boolean;
  highlightCursor?: boolean;
  blurBackground?: boolean;
  cropArea?: CropArea;
  micVolume?: number;
  noiseSuppressionLevel?: 'off' | 'low' | 'medium' | 'high';
}

export interface VideoComment {
  id: string;
  author: string;
  time: number;
  text: string;
  createdAt: number;
}

export interface VideoReaction {
  id: string;
  emoji: string;
  time: number;
  createdAt: number;
}

export interface TranscriptItem {
  time: number;
  text: string;
}

export interface ChapterItem {
  id: string;
  time: number;
  title: string;
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
  shareUrl?: string;
  viewsCount?: number;
  aiTitle?: string;
  aiSummary?: string;
  transcript?: TranscriptItem[];
  chapters?: ChapterItem[];
  comments?: VideoComment[];
  reactions?: VideoReaction[];
  cropArea?: CropArea;
}

export interface IpcEvents {
  'recording:start': (options: RecordingOptions) => void;
  'recording:stop': () => void;
  'recording:pause': () => void;
  'recording:resume': () => void;
  'recording:restart': () => void;
  'recording:cancel': () => void;
  'recording:state-changed': (state: 'idle' | 'countdown' | 'recording' | 'paused' | 'stopped') => void;
  'recording:toggle-mic': () => void;
  'bubble:set-size': (size: BubbleSize) => void;
  'bubble:set-visible': (visible: boolean) => void;
  'drawing:toggle': () => void;
  'drawing:set-active': (active: boolean) => void;
  'drawing:clear': () => void;
  'sound:play': (sound: 'start' | 'stop' | 'pause' | 'complete' | 'countdown' | 'camera') => void;
}
