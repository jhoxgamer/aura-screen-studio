class LiveShareService {
  private activeStream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private intervalId: any = null;
  private isCapturing: boolean = false;
  private isPaused: boolean = false;

  public async startCapture(sourceId?: string): Promise<boolean> {
    if (this.isCapturing) return true;

    try {
      let targetSourceId = sourceId;
      if (!targetSourceId) {
        const sources = await window.electronAPI.getSources();
        const primary = sources.find((s: any) => s.id.startsWith('screen:')) || sources[0];
        targetSourceId = primary?.id;
      }

      if (!targetSourceId) return false;

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
            maxFrameRate: 30
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

      // Continuous 25 FPS screen capture
      this.intervalId = setInterval(() => {
        this.captureAndDispatchFrame();
      }, 40);

      return true;
    } catch (err) {
      console.error('Failed to start live screen capture:', err);
      return false;
    }
  }

  private captureAndDispatchFrame() {
    if (!this.isCapturing || this.isPaused || !this.videoEl || !this.canvasEl) return;
    if (this.videoEl.videoWidth === 0 || this.videoEl.videoHeight === 0) return;

    const ctx = this.canvasEl.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Scale resolution for high-definition 1080p presentation with low bandwidth footprint
    const targetWidth = Math.min(1600, this.videoEl.videoWidth);
    const targetHeight = Math.round((targetWidth / this.videoEl.videoWidth) * this.videoEl.videoHeight);

    if (this.canvasEl.width !== targetWidth || this.canvasEl.height !== targetHeight) {
      this.canvasEl.width = targetWidth;
      this.canvasEl.height = targetHeight;
    }

    ctx.drawImage(this.videoEl, 0, 0, targetWidth, targetHeight);

    this.canvasEl.toBlob(
      (blob) => {
        if (blob && window.electronAPI?.sendLiveFrame) {
          blob.arrayBuffer().then((buf) => {
            window.electronAPI.sendLiveFrame(buf);
          });
        }
      },
      'image/jpeg',
      0.82
    );
  }

  public setPaused(paused: boolean) {
    this.isPaused = paused;
  }

  public stopCapture() {
    this.isCapturing = false;
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
