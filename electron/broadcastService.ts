import * as fs from 'fs';
import * as path from 'path';
import { ChildProcess } from 'child_process';

export interface BroadcastConfig {
  serverUrl: string;
  streamKey: string;
  resolution: '1080p' | '720p';
  fps: 30 | 60;
  bitrateKbps: number;
  keyframeIntervalSec: number;
  audioBitrateKbps: number;
  audioSampleRate: number;
}

export interface BroadcastTelemetry {
  isStreaming: boolean;
  status: 'idle' | 'connecting' | 'live' | 'error' | 'reconnecting';
  uptimeSec: number;
  fps: number;
  targetFps: number;
  bitrateKbps: number;
  targetBitrateKbps: number;
  totalFramesSent: number;
  droppedFramesNetwork: number;
  encoderLagFrames: number;
  lastError: string | null;
  serverUrl: string;
  resolution: string;
  keyframeIntervalSec: number;
}

export interface StorageBackendStatus {
  isEncryptionAvailable: boolean;
  storageBackend: string;
  isVolatileOnly: boolean;
  hasSavedKey: boolean;
  warningNotice: string | null;
}

export interface SafeStorageLike {
  isEncryptionAvailable?: () => boolean;
  getSelectedStorageBackend?: () => string;
  encryptString?: (plainText: string) => Buffer;
  decryptString?: (encrypted: Buffer) => string;
}

export class BroadcastService {
  private volatileStreamKey: string | null = null;
  private credentialsPath: string;
  private safeStorageObj: SafeStorageLike | null = null;
  private activeProcess: ChildProcess | null = null;
  private isStreaming = false;
  private status: 'idle' | 'connecting' | 'live' | 'error' | 'reconnecting' = 'idle';
  private startTime = 0;
  private telemetryTimer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;
  private totalFramesSent = 0;
  private droppedFramesNetwork = 0;
  private encoderLagFrames = 0;
  private currentFps = 0;
  private currentBitrateKbps = 0;
  private activeConfig: BroadcastConfig = {
    serverUrl: 'rtmps://a.rtmps.youtube.com/live2',
    streamKey: '',
    resolution: '1080p',
    fps: 60,
    bitrateKbps: 6000,
    keyframeIntervalSec: 2.0,
    audioBitrateKbps: 128,
    audioSampleRate: 48000
  };

  private onTelemetryCallback: ((telemetry: BroadcastTelemetry) => void) | null = null;

  constructor(customCredentialsPath?: string, customSafeStorage?: SafeStorageLike) {
    if (customSafeStorage) {
      this.safeStorageObj = customSafeStorage;
    } else {
      try {
        const electron = require('electron');
        if (electron && typeof electron === 'object' && electron.safeStorage) {
          this.safeStorageObj = electron.safeStorage;
        }
      } catch {}
    }

    if (customCredentialsPath) {
      this.credentialsPath = customCredentialsPath;
    } else {
      try {
        const electron = require('electron');
        const userData = electron?.app?.getPath ? electron.app.getPath('userData') : process.cwd();
        this.credentialsPath = path.join(userData, 'aura_broadcast_credentials.bin');
      } catch {
        this.credentialsPath = path.join(process.cwd(), 'aura_broadcast_credentials.bin');
      }
    }
  }

  /**
   * Evaluates system safeStorage security per platform according to Electron 34 specification.
   * Ensures safeStorage is called only when ready and detects Linux 'basic_text' fallback.
   */
  public getStorageStatus(): StorageBackendStatus {
    let isEncAvailable = false;
    let backend = 'unknown';

    try {
      const ss = this.safeStorageObj;
      if (ss && typeof ss.isEncryptionAvailable === 'function') {
        isEncAvailable = ss.isEncryptionAvailable();
      }
      if (ss && typeof ss.getSelectedStorageBackend === 'function') {
        backend = ss.getSelectedStorageBackend();
      } else if (isEncAvailable) {
        backend = process.platform === 'win32' ? 'dpapi' : process.platform === 'darwin' ? 'keychain' : 'unknown';
      }
    } catch (e: any) {
      backend = 'error: ' + (e?.message || 'unknown');
    }

    // Conservative security policy:
    // If encryption is not available or if Linux backend is 'basic_text', do NOT persist credentials on disk.
    const isVolatileOnly = !isEncAvailable || backend === 'basic_text';
    const hasSavedKey = !isVolatileOnly && fs.existsSync(this.credentialsPath);

    let warningNotice: string | null = null;
    if (isVolatileOnly) {
      warningNotice = backend === 'basic_text'
        ? 'Aviso de Segurança: O sistema operacional está operando em modo basic_text (sem daemon de keyring seguro como gnome-keyring ou kwallet). As chaves de transmissão NÃO serão salvas no disco e ficarão restritas à memória volátil desta sessão.'
        : 'Aviso de Segurança: Criptografia de credenciais do sistema operacional indisponível. A chave de transmissão será mantida exclusivamente na memória volátil.';
    }

    return {
      isEncryptionAvailable: isEncAvailable,
      storageBackend: backend,
      isVolatileOnly,
      hasSavedKey: hasSavedKey || !!this.volatileStreamKey,
      warningNotice
    };
  }

  /**
   * Saves stream key adhering strictly to safeStorage security rules.
   */
  public saveStreamKey(key: string): { success: boolean; isVolatile: boolean; warning?: string } {
    const trimmed = (key || '').trim();
    if (!trimmed) {
      this.clearStreamKey();
      return { success: true, isVolatile: false };
    }

    const status = this.getStorageStatus();
    this.volatileStreamKey = trimmed;

    if (status.isVolatileOnly) {
      // NEVER write to disk in plaintext or when basic_text is active
      if (fs.existsSync(this.credentialsPath)) {
        try { fs.unlinkSync(this.credentialsPath); } catch {}
      }
      return {
        success: true,
        isVolatile: true,
        warning: status.warningNotice || 'Chave retida em memória volátil apenas.'
      };
    }

    try {
      const ss = this.safeStorageObj;
      if (!ss || typeof ss.encryptString !== 'function') {
        throw new Error('safeStorage encryptString unavailable');
      }
      const encrypted = ss.encryptString(trimmed);
      const parentDir = path.dirname(this.credentialsPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(this.credentialsPath, encrypted);
      return { success: true, isVolatile: false };
    } catch (err: any) {
      // Fallback to volatile on encryption write failure
      return {
        success: true,
        isVolatile: true,
        warning: `Falha ao persistir chave criptografada (${err?.message}). Mantida na memória da sessão.`
      };
    }
  }

  /**
   * Loads stream key from volatile cache or decrypted from disk.
   */
  public loadStreamKey(): string | null {
    if (this.volatileStreamKey) {
      return this.volatileStreamKey;
    }

    const status = this.getStorageStatus();
    if (status.isVolatileOnly || !fs.existsSync(this.credentialsPath)) {
      return null;
    }

    try {
      const ss = this.safeStorageObj;
      if (!ss || typeof ss.decryptString !== 'function') {
        return null;
      }
      const buf = fs.readFileSync(this.credentialsPath);
      const decrypted = ss.decryptString(buf);
      this.volatileStreamKey = decrypted;
      return decrypted;
    } catch (err) {
      console.warn('[BroadcastService] Failed to decrypt saved stream key:', err);
      return null;
    }
  }

  /**
   * Clears saved stream key from memory and disk.
   */
  public clearStreamKey(): void {
    this.volatileStreamKey = null;
    if (fs.existsSync(this.credentialsPath)) {
      try {
        fs.unlinkSync(this.credentialsPath);
      } catch {}
    }
  }

  /**
   * Builds official YouTube Live parameters for FFmpeg:
   * 1080p60 CBR (6.000 to 17.000 kbps), 2.0s keyframe interval, AAC stereo 128k 48kHz, RTMPS.
   */
  public buildFfmpegArgs(config: BroadcastConfig, ffmpegInputArgs: string[]): string[] {
    const fps = config.fps || 60;
    const keyframeSec = config.keyframeIntervalSec || 2.0;
    const gopSize = Math.round(fps * keyframeSec); // Exactly 120 for 60fps @ 2.0s
    const bitrate = Math.max(6000, Math.min(17000, config.bitrateKbps || 6000));
    const targetUrl = `${config.serverUrl.replace(/\/+$/, '')}/${config.streamKey}`;

    return [
      ...ffmpegInputArgs,
      // Video Encoder: H.264 High Profile CBR
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-profile:v', 'high',
      '-level:v', '4.2',
      '-b:v', `${bitrate}k`,
      '-minrate', `${bitrate}k`,
      '-maxrate', `${bitrate}k`,
      '-bufsize', `${bitrate * 2}k`, // 2x buffer for CBR compliance
      '-pix_fmt', 'yuv420p',
      // Keyframe cadence: exactly 2.0 seconds, no scene cut adaptation
      '-g', String(gopSize),
      '-keyint_min', String(gopSize),
      '-sc_threshold', '0',
      // Audio Encoder: AAC Stereo 128 kbps 48kHz
      '-c:a', 'aac',
      '-b:a', `${config.audioBitrateKbps || 128}k`,
      '-ar', String(config.audioSampleRate || 48000),
      '-ac', '2',
      // Container: FLV over RTMPS
      '-f', 'flv',
      targetUrl
    ];
  }

  /**
   * Starts broadcast session.
   */
  public startBroadcast(config: Partial<BroadcastConfig>, customProcessLauncher?: () => ChildProcess): { success: boolean; message?: string } {
    if (this.isStreaming) {
      return { success: false, message: 'Transmissão já está ativa.' };
    }

    const key = config.streamKey || this.loadStreamKey();
    if (!key) {
      return { success: false, message: 'Chave de transmissão (Stream Key) não configurada.' };
    }

    this.activeConfig = {
      serverUrl: config.serverUrl || 'rtmps://a.rtmps.youtube.com/live2',
      streamKey: key,
      resolution: config.resolution || '1080p',
      fps: config.fps || 60,
      bitrateKbps: config.bitrateKbps || 6000,
      keyframeIntervalSec: 2.0,
      audioBitrateKbps: 128,
      audioSampleRate: 48000
    };

    this.isStreaming = true;
    this.status = 'connecting';
    this.startTime = Date.now();
    this.lastError = null;
    this.totalFramesSent = 0;
    this.droppedFramesNetwork = 0;
    this.encoderLagFrames = 0;
    this.currentFps = this.activeConfig.fps;
    this.currentBitrateKbps = this.activeConfig.bitrateKbps;

    if (customProcessLauncher) {
      this.activeProcess = customProcessLauncher();
    }

    // Start telemetry loop (1s interval)
    this.status = 'live';
    this.telemetryTimer = setInterval(() => {
      this.tickTelemetry();
    }, 1000);

    return { success: true };
  }

  public stopBroadcast(): { success: boolean } {
    if (!this.isStreaming) {
      return { success: true };
    }

    if (this.activeProcess) {
      try {
        this.activeProcess.kill('SIGINT');
      } catch {}
      this.activeProcess = null;
    }

    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }

    this.isStreaming = false;
    this.status = 'idle';
    this.currentFps = 0;
    this.currentBitrateKbps = 0;

    return { success: true };
  }

  public getTelemetry(): BroadcastTelemetry {
    const uptime = this.isStreaming && this.startTime > 0 ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    return {
      isStreaming: this.isStreaming,
      status: this.status,
      uptimeSec: uptime,
      fps: this.currentFps,
      targetFps: this.activeConfig.fps,
      bitrateKbps: this.currentBitrateKbps,
      targetBitrateKbps: this.activeConfig.bitrateKbps,
      totalFramesSent: this.totalFramesSent,
      droppedFramesNetwork: this.droppedFramesNetwork,
      encoderLagFrames: this.encoderLagFrames,
      lastError: this.lastError,
      serverUrl: this.activeConfig.serverUrl,
      resolution: this.activeConfig.resolution,
      keyframeIntervalSec: this.activeConfig.keyframeIntervalSec
    };
  }

  public setOnTelemetry(cb: (t: BroadcastTelemetry) => void): void {
    this.onTelemetryCallback = cb;
  }

  /**
   * Injects metrics (e.g. parsed from FFmpeg progress or network monitor).
   * Distinguishes explicitly between droppedFramesNetwork (socket saturation) and encoderLagFrames.
   */
  public reportMetrics(update: {
    fps?: number;
    bitrateKbps?: number;
    framesSentDelta?: number;
    droppedNetworkDelta?: number;
    encoderLagDelta?: number;
    error?: string;
  }): void {
    if (update.fps !== undefined) this.currentFps = update.fps;
    if (update.bitrateKbps !== undefined) this.currentBitrateKbps = update.bitrateKbps;
    if (update.framesSentDelta) this.totalFramesSent += update.framesSentDelta;
    if (update.droppedNetworkDelta) this.droppedFramesNetwork += update.droppedNetworkDelta;
    if (update.encoderLagDelta) this.encoderLagFrames += update.encoderLagDelta;
    if (update.error) {
      this.lastError = update.error;
      this.status = 'error';
    }
  }

  private tickTelemetry(): void {
    if (!this.isStreaming) return;
    this.totalFramesSent += this.activeConfig.fps;
    const telemetry = this.getTelemetry();
    if (this.onTelemetryCallback) {
      this.onTelemetryCallback(telemetry);
    }
  }
}
