export interface LiveAudioStatus {
  micAvailable: boolean;
  systemAudioAvailable: boolean;
  micError?: string;
  systemError?: string;
}

class LiveShareService {
  private activeStream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private intervalId: any = null;
  private isCapturing: boolean = false;
  private isPaused: boolean = false;
  private isDispatching: boolean = false;
  private targetFps: number = 60; // 60 FPS Ultra-Smooth by default!
  private quality: number = 0.88; // Crisp 1080p high fidelity
  private framesSent: number = 0;
  private lastFpsCheck: number = Date.now();
  private currentFps: number = 60;

  // Experimental MSE Pipeline State
  private transportMode: 'mjpeg' | 'mse' = 'mjpeg';
  private mediaRecorder: MediaRecorder | null = null;
  private micStream: MediaStream | null = null;
  private systemAudioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private audioStatus: LiveAudioStatus = {
    micAvailable: false,
    systemAudioAvailable: false
  };

  public onAudioStatusChanged?: (status: LiveAudioStatus) => void;
  public onTransportError?: (err: Error) => void;

  public async startCapture(sourceId?: string, fps: number = 60): Promise<boolean> {
    if (this.isCapturing) return true;
    this.targetFps = fps;

    try {
      let targetSourceId = sourceId;
      if (!targetSourceId) {
        const sources = await window.electronAPI.getSources();
        const primary = sources.find((s: any) => s.id.startsWith('screen:')) || sources[0];
        targetSourceId = primary?.id;
      }

      if (!targetSourceId) return false;

      // Request desktop stream at up to 60 FPS with 1080p high resolution
      const stream = await (navigator.mediaDevices as any).getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: targetSourceId,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080,
            maxFrameRate: 60
          }
        }
      });

      this.activeStream = stream;
      this.videoEl = document.createElement('video');
      this.videoEl.srcObject = stream;
      this.videoEl.muted = true;
      await this.videoEl.play();

      this.canvasEl = document.createElement('canvas');
      this.isCapturing = true;
      this.framesSent = 0;
      this.lastFpsCheck = Date.now();

      // Launch capture loop according to active mode
      if (this.transportMode === 'mjpeg') {
        this.scheduleNextFrame();
      } else {
        await this.startMsePipeline();
      }

      return true;
    } catch (err) {
      console.error('Failed to start live screen capture:', err);
      return false;
    }
  }

  public getTransportMode(): 'mjpeg' | 'mse' {
    return this.transportMode;
  }

  public async setTransportMode(mode: 'mjpeg' | 'mse'): Promise<boolean> {
    if (this.transportMode === mode) return true;
    this.transportMode = mode;

    if (window.electronAPI?.setLiveTransportMode) {
      await window.electronAPI.setLiveTransportMode(mode);
    }

    if (!this.isCapturing) return true;

    if (mode === 'mjpeg') {
      // Tear down MSE recording pipeline
      this.stopMsePipeline();
      // Resume MJPEG canvas scheduler
      this.scheduleNextFrame();
    } else if (mode === 'mse') {
      // Pause MJPEG canvas scheduler
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      // Start MSE recording pipeline with real audio
      await this.startMsePipeline();
    }

    return true;
  }

  public getAudioStatus(): LiveAudioStatus {
    return { ...this.audioStatus };
  }

  private async startMsePipeline(): Promise<void> {
    this.stopMsePipeline();

    // 1. Capture real microphone audio (without masking failure)
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false
        },
        video: false
      });
      this.audioStatus.micAvailable = true;
      this.audioStatus.micError = undefined;
    } catch (err: any) {
      console.warn('[LiveShare MSE] Real microphone capture failed:', err.message);
      this.micStream = null;
      this.audioStatus.micAvailable = false;
      this.audioStatus.micError = err.message || 'Microfone indisponível';
    }

    // 2. Capture real system audio when supported
    try {
      this.systemAudioStream = await (navigator.mediaDevices as any).getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop'
          }
        },
        video: false
      });
      this.audioStatus.systemAudioAvailable = true;
      this.audioStatus.systemError = undefined;
    } catch (err: any) {
      console.warn('[LiveShare MSE] Real desktop system audio capture failed:', err.message);
      this.systemAudioStream = null;
      this.audioStatus.systemAudioAvailable = false;
      this.audioStatus.systemError = err.message || 'Áudio de sistema indisponível';
    }

    if (this.onAudioStatusChanged) {
      this.onAudioStatusChanged(this.getAudioStatus());
    }

    // 3. Audio mixing via Web Audio API DSP
    const audioTracks: MediaStreamTrack[] = [];
    if (this.micStream || this.systemAudioStream) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioCtx();
        const destination = this.audioContext.createMediaStreamDestination();

        if (this.micStream && this.micStream.getAudioTracks().length > 0) {
          const micSource = this.audioContext.createMediaStreamSource(this.micStream);
          micSource.connect(destination);
        }

        if (this.systemAudioStream && this.systemAudioStream.getAudioTracks().length > 0) {
          const sysSource = this.audioContext.createMediaStreamSource(this.systemAudioStream);
          sysSource.connect(destination);
        }

        if (destination.stream.getAudioTracks().length > 0) {
          audioTracks.push(destination.stream.getAudioTracks()[0]);
        }
      } catch (e) {
        console.warn('[LiveShare MSE] AudioContext mixer warning:', e);
      }
    }

    // 4. Combine screen video with mixed audio track
    const tracks: MediaStreamTrack[] = [];
    if (this.activeStream) {
      const videoTrack = this.activeStream.getVideoTracks()[0];
      if (videoTrack) tracks.push(videoTrack);
    }
    audioTracks.forEach((t) => tracks.push(t));

    const combinedStream = new MediaStream(tracks);

    // 5. Initialize MediaRecorder with standard WebM VP8/Opus
    const mimeCandidates = [
      'video/webm; codecs="vp8, opus"',
      'video/webm; codecs=vp8,opus',
      'video/webm; codecs=vp8',
      'video/webm'
    ];

    let chosenMime = 'video/webm';
    for (const m of mimeCandidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) {
        chosenMime = m;
        break;
      }
    }

    try {
      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: chosenMime,
        videoBitsPerSecond: 1500000 // 1.5 Mbps
      });

      this.mediaRecorder.ondataavailable = async (event: BlobEvent) => {
        if (event.data && event.data.size > 0 && !this.isPaused) {
          try {
            const buf = await event.data.arrayBuffer();
            window.electronAPI?.sendLiveMseChunk?.(buf);
            this.framesSent += 15;
            const now = Date.now();
            if (now - this.lastFpsCheck >= 1000) {
              this.currentFps = Math.round((this.framesSent * 1000) / (now - this.lastFpsCheck));
              this.framesSent = 0;
              this.lastFpsCheck = now;
            }
          } catch (e) {}
        }
      };

      this.mediaRecorder.onerror = (event: any) => {
        console.error('[LiveShare MSE] MediaRecorder error:', event.error);
        if (this.onTransportError) {
          this.onTransportError(event.error || new Error('MediaRecorder error'));
        }
        // Automatic fallback to standard MJPEG
        this.setTransportMode('mjpeg');
      };

      this.mediaRecorder.start(500); // 500 ms clusters
    } catch (err: any) {
      console.error('[LiveShare MSE] Failed to instantiate MediaRecorder:', err);
      if (this.onTransportError) {
        this.onTransportError(err);
      }
      this.setTransportMode('mjpeg');
    }
  }

  private stopMsePipeline() {
    if (this.mediaRecorder) {
      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch (e) {}
      this.mediaRecorder = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    if (this.systemAudioStream) {
      this.systemAudioStream.getTracks().forEach((t) => t.stop());
      this.systemAudioStream = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
      this.audioContext = null;
    }
  }

  public setTargetFps(fps: number) {
    this.targetFps = Math.max(15, Math.min(60, fps));
    if (this.intervalId && this.transportMode === 'mjpeg') {
      clearInterval(this.intervalId);
      this.scheduleNextFrame();
    }
  }

  public getTargetFps(): number {
    return this.targetFps;
  }

  public getCurrentFps(): number {
    return this.currentFps;
  }

  public setQuality(quality: number) {
    this.quality = Math.max(0.5, Math.min(0.95, quality));
  }

  private scheduleNextFrame() {
    const frameIntervalMs = Math.round(1000 / this.targetFps);
    this.intervalId = setInterval(() => {
      this.captureAndDispatchFrame();
    }, frameIntervalMs);
  }

  private captureAndDispatchFrame() {
    if (!this.isCapturing || this.isPaused || !this.videoEl || !this.canvasEl) return;
    if (this.videoEl.videoWidth === 0 || this.videoEl.videoHeight === 0) return;
    if (this.isDispatching) return; // Prevent frame piling / backpressure

    const ctx = this.canvasEl.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Full 1080p high definition presentation
    const targetWidth = Math.min(1920, this.videoEl.videoWidth);
    const targetHeight = Math.round((targetWidth / this.videoEl.videoWidth) * this.videoEl.videoHeight);

    if (this.canvasEl.width !== targetWidth || this.canvasEl.height !== targetHeight) {
      this.canvasEl.width = targetWidth;
      this.canvasEl.height = targetHeight;
    }

    ctx.drawImage(this.videoEl, 0, 0, targetWidth, targetHeight);
    this.isDispatching = true;

    this.canvasEl.toBlob(
      (blob) => {
        if (blob && window.electronAPI?.sendLiveFrame) {
          blob.arrayBuffer().then((buf) => {
            window.electronAPI.sendLiveFrame(buf);
            this.isDispatching = false;
            this.framesSent++;

            const now = Date.now();
            if (now - this.lastFpsCheck >= 1000) {
              this.currentFps = Math.round((this.framesSent * 1000) / (now - this.lastFpsCheck));
              this.framesSent = 0;
              this.lastFpsCheck = now;
            }
          }).catch(() => {
            this.isDispatching = false;
          });
        } else {
          this.isDispatching = false;
        }
      },
      'image/jpeg',
      this.quality
    );
  }

  public setPaused(paused: boolean) {
    this.isPaused = paused;
    if (this.mediaRecorder) {
      try {
        if (paused && this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.pause();
        } else if (!paused && this.mediaRecorder.state === 'paused') {
          this.mediaRecorder.resume();
        }
      } catch (e) {}
    }
  }

  public stopCapture() {
    this.isCapturing = false;
    this.isDispatching = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.stopMsePipeline();
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((t) => t.stop());
      this.activeStream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
    this.canvasEl = null;
  }
}

export const liveShareService = new LiveShareService();

