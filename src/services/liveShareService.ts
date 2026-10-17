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

      // Launch dynamic high-frequency loop for smooth 60 FPS delivery
      this.scheduleNextFrame();

      return true;
    } catch (err) {
      console.error('Failed to start live screen capture:', err);
      return false;
    }
  }

  public setTargetFps(fps: number) {
    this.targetFps = Math.max(15, Math.min(60, fps));
    if (this.intervalId) {
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
  }

  public stopCapture() {
    this.isCapturing = false;
    this.isDispatching = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
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
