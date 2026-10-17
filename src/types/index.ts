export type RecordingMode = 'screen-cam' | 'screen-only' | 'cam-only' | 'custom-area';
export type BubbleSize = 'small' | 'medium' | 'large' | 'fullscreen';

export type DrawingTool =
  | 'pen'
  | 'smartpen'
  | 'highlighter'
  | 'arrow'
  | 'darrow'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'stamp'
  | 'mosaic'
  | 'text'
  | 'laser'
  | 'eraser';

export type FillMode = 'outline' | 'tint' | 'solid';
export type WhiteboardMode = 'screen' | 'whiteboard' | 'blackboard';
export type StampType = 'check' | 'cross' | 'star' | 'heart' | 'question' | 'arrow' | 'number';

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
  countdownSeconds?: number;
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
      getShareUrl: (id: string) => Promise<string>;
      getPublicUrl: () => Promise<string | null>;
      getServerPort?: () => Promise<number>;
      updateTitle: (id: string, newTitle: string) => Promise<boolean>;
      updateChapters: (id: string, chapters: ChapterItem[]) => Promise<boolean>;
      downloadRecording: (id: string) => Promise<boolean>;
      trimRecording: (id: string, buffer: ArrayBuffer, newDurationMs: number) => Promise<any>;
      openPreview: (idOrMeta: string | RecordingMeta) => void;
      openPreRecording: () => void;
      openExternalUrl: (url: string) => void;
      toggleSpeakerNotes: () => void;
      resizeSpeakerNotes: (width: number, height: number) => void;
      dockSpeakerNotes: (target: 'top-center' | 'near-camera') => void;
      setSpeakerNotesIgnoreMouse: (ignore: boolean) => void;
      onSpeakerNotesStateChanged: (callback: (isOpen: boolean) => void) => () => void;
      startCropSelection: () => void;
      sendCropArea: (area: CropArea) => void;
      cancelCropSelection: () => void;
      takeScreenshot: () => void;
      copyScreenshotToClipboard: (dataUrl: string) => Promise<boolean>;
      saveScreenshotFile: (dataUrl: string) => Promise<string>;
      onScreenshotData: (callback: (dataUrl: string) => void) => () => void;
      checkForUpdates: () => Promise<{ isLatest: boolean; version: string; error?: string }>;
      getAppVersion: () => Promise<string>;
      startUpdateDownload: () => void;
      installUpdateNow: () => void;
      onUpdateStatusChanged: (callback: (status: { state: string; version?: string; percent?: number; releaseNotes?: string }) => void) => () => void;
      onUpdateProgress: (callback: (percent: number) => void) => () => void;
      closeCurrentWindow: () => void;
      minimizeCurrentWindow: () => void;
      onRecordingStateChanged: (callback: (state: string) => void) => () => void;
      onToggleMic?: (callback: () => void) => () => void;
      onCountdownTick: (callback: (count: number) => void) => () => void;
      onCountdownInit?: (callback: (data: { total: number; current: number }) => void) => () => void;
      onBubbleSizeChanged: (callback: (size: BubbleSize) => void) => () => void;
      onDrawingToggled: (callback: (active: boolean) => void) => () => void;
      onPlaySound: (callback: (sound: string) => void) => () => void;
      onOpenPreview: (callback: (meta: RecordingMeta) => void) => () => void;
      onRecordingOptions: (callback: (options: RecordingOptions) => void) => () => void;
      onCropAreaSelected: (callback: (area: CropArea) => void) => () => void;
    };
  }
}
