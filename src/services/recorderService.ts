import { RecordingOptions, ChapterItem } from '../types';

export interface RecordingScene {
  id: string;
  name: string;
  durationMs: number;
  chunks: Blob[];
}

export class RecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private currentSceneChunks: Blob[] = [];
  private scenes: RecordingScene[] = [];
  private currentSceneStartTime: number = 0;
  private currentSceneAccumulatedMs: number = 0;
  private screenStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private micGainNode: GainNode | null = null;
  private durationInterval: any = null;
  private onDurationUpdate?: (totalMs: number, sceneMs: number, sceneNumber: number) => void;
  private isCroppingActive: boolean = false;
  private cropVideoElement: HTMLVideoElement | null = null;
  private cropAnimFrame: number | null = null;
  private rawScreenStream: MediaStream | null = null;

  async start(
    options: RecordingOptions,
    onDuration?: (totalMs: number, sceneMs: number, sceneNumber: number) => void
  ): Promise<void> {
    this.currentSceneChunks = [];
    this.scenes = [];
    this.currentSceneAccumulatedMs = 0;
    this.onDurationUpdate = onDuration;

    let width = 1920;
    let height = 1080;
    if (options.resolution === '720p') {
      width = 1280;
      height = 720;
    } else if (options.resolution === '4k') {
      width = 3840;
      height = 2160;
    }

    const fps = options.fps || 60;

    // 1. Capture screen, window, or camera
    if (options.mode === 'screen-cam' || options.mode === 'screen-only' || options.mode === 'custom-area') {
      let sourceId = options.sourceId;
      if (!sourceId && window.electronAPI?.getSources) {
        try {
          const list = await window.electronAPI.getSources();
          if (list.length > 0) sourceId = list[0].id;
        } catch (e) {}
      }

      const videoConstraints: any = {
        mandatory: {
          chromeMediaSource: 'desktop',
          minWidth: 1280,
          maxWidth: width,
          minHeight: 720,
          maxHeight: height,
          maxFrameRate: fps
        }
      };
      if (sourceId) {
        videoConstraints.mandatory.chromeMediaSourceId = sourceId;
      }

      try {
        this.screenStream = await navigator.mediaDevices.getUserMedia({
          audio: options.includeSystemAudio
            ? {
                mandatory: {
                  chromeMediaSource: 'desktop'
                }
              } as any
            : false,
          video: videoConstraints
        });
      } catch (err) {
        console.warn('Initial desktop capture failed, retrying without desktop audio:', err);
        try {
          this.screenStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: videoConstraints
          });
        } catch (videoErr) {
          console.warn('Desktop getUserMedia failed, trying displayMedia fallback:', videoErr);
          this.screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: { max: width }, height: { max: height }, frameRate: fps },
            audio: options.includeSystemAudio
          });
        }
      }

      // If custom-area mode is active with defined crop coordinates
      if (options.mode === 'custom-area' && options.cropArea && this.screenStream) {
        try {
          this.rawScreenStream = this.screenStream;
          const crop = options.cropArea;

          const hiddenVideo = document.createElement('video');
          hiddenVideo.autoplay = true;
          hiddenVideo.muted = true;
          hiddenVideo.playsInline = true;
          hiddenVideo.srcObject = this.rawScreenStream;
          this.cropVideoElement = hiddenVideo;

          await new Promise<void>((resolve) => {
            if (hiddenVideo.readyState >= 2 && hiddenVideo.videoWidth > 0) {
              resolve();
            } else {
              const onReady = () => {
                if (hiddenVideo.videoWidth > 0) {
                  hiddenVideo.removeEventListener('loadedmetadata', onReady);
                  hiddenVideo.removeEventListener('canplay', onReady);
                  resolve();
                }
              };
              hiddenVideo.addEventListener('loadedmetadata', onReady);
              hiddenVideo.addEventListener('canplay', onReady);
              setTimeout(resolve, 500);
            }
          });

          try {
            await hiddenVideo.play();
          } catch (e) {
            console.warn('hiddenVideo play notification:', e);
          }

          const vidW = hiddenVideo.videoWidth || 1920;
          const vidH = hiddenVideo.videoHeight || 1080;
          const screenW = window.screen.width || vidW;
          const screenH = window.screen.height || vidH;

          const scaleX = vidW / screenW;
          const scaleY = vidH / screenH;

          const sourceX = Math.max(0, Math.round(crop.x * scaleX));
          const sourceY = Math.max(0, Math.round(crop.y * scaleY));
          const sourceW = Math.min(vidW - sourceX, Math.max(2, Math.round(crop.width * scaleX)));
          const sourceH = Math.min(vidH - sourceY, Math.max(2, Math.round(crop.height * scaleY)));

          const targetW = sourceW % 2 === 0 ? sourceW : sourceW - 1;
          const targetH = sourceH % 2 === 0 ? sourceH : sourceH - 1;

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true } as any) as CanvasRenderingContext2D | null;

          this.isCroppingActive = true;

          const renderCrop = () => {
            if (!this.isCroppingActive) return;

            if (ctx && hiddenVideo.readyState >= 2) {
              ctx.drawImage(
                hiddenVideo,
                sourceX,
                sourceY,
                sourceW,
                sourceH,
                0,
                0,
                targetW,
                targetH
              );
            }
            this.cropAnimFrame = requestAnimationFrame(renderCrop);
          };

          renderCrop();

          const croppedStream = (canvas as any).captureStream(fps);
          this.rawScreenStream.getAudioTracks().forEach((t) => croppedStream.addTrack(t));
          this.screenStream = croppedStream;
        } catch (cropErr) {
          console.error('Error applying crop to stream:', cropErr);
        }
      }
    } else {
      // Cam only mode: capture camera stream directly as primary video
      this.screenStream = await navigator.mediaDevices.getUserMedia({
        video: options.videoDeviceId
          ? { deviceId: { exact: options.videoDeviceId }, width: { ideal: width }, height: { ideal: height }, frameRate: fps }
          : { width: { ideal: width }, height: { ideal: height }, frameRate: fps },
        audio: false
      });
    }

    // 2. Capture microphone audio if available
    const noiseLevel = options.noiseSuppressionLevel ?? 'medium';
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: options.audioDeviceId
          ? {
              deviceId: { exact: options.audioDeviceId },
              echoCancellation: true,
              noiseSuppression: noiseLevel !== 'off',
              autoGainControl: false
            }
          : {
              echoCancellation: true,
              noiseSuppression: noiseLevel !== 'off',
              autoGainControl: false
            },
        video: false
      });
    } catch (err) {
      console.warn('No microphone available or permission denied:', err);
      this.micStream = null;
    }

    // 3. Audio mixing with Web Audio API DSP Chain
    const tracks: MediaStreamTrack[] = [];
    if (this.screenStream) {
      const videoTrack = this.screenStream.getVideoTracks()[0];
      if (videoTrack) {
        tracks.push(videoTrack);
      }
    }

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const destination = this.audioContext.createMediaStreamDestination();
    let hasAudio = false;

    // Add microphone to mixer with DSP processing (Filters -> Gain Boost -> Limiter)
    if (this.micStream && this.micStream.getAudioTracks().length > 0) {
      const micSource = this.audioContext.createMediaStreamSource(this.micStream);
      let currentNode: AudioNode = micSource;

      // Real noise filtering stages
      if (noiseLevel === 'low') {
        // Highpass at 80Hz: removes 50/60Hz AC electrical hum, desk vibration, and low rumble
        const highpass = this.audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(80, this.audioContext.currentTime);
        highpass.Q.setValueAtTime(0.707, this.audioContext.currentTime);
        currentNode.connect(highpass);
        currentNode = highpass;
      } else if (noiseLevel === 'medium') {
        // Highpass at 120Hz + Notch at 3500Hz for room fan & laptop noise suppression
        const highpass = this.audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(120, this.audioContext.currentTime);
        highpass.Q.setValueAtTime(0.8, this.audioContext.currentTime);
        currentNode.connect(highpass);
        currentNode = highpass;

        const notch = this.audioContext.createBiquadFilter();
        notch.type = 'peaking';
        notch.frequency.setValueAtTime(3500, this.audioContext.currentTime);
        notch.gain.setValueAtTime(-5, this.audioContext.currentTime);
        notch.Q.setValueAtTime(1.5, this.audioContext.currentTime);
        currentNode.connect(notch);
        currentNode = notch;
      } else if (noiseLevel === 'high') {
        // Highpass at 160Hz + Lowpass at 7500Hz for aggressive voice clarity in noisy environments
        const highpass = this.audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(160, this.audioContext.currentTime);
        highpass.Q.setValueAtTime(0.9, this.audioContext.currentTime);
        currentNode.connect(highpass);
        currentNode = highpass;

        const lowpass = this.audioContext.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(7500, this.audioContext.currentTime);
        lowpass.Q.setValueAtTime(0.707, this.audioContext.currentTime);
        currentNode.connect(lowpass);
        currentNode = lowpass;
      }

      // Mic Volume Gain Node (0% to 200%, 100% = 1.0, 200% = 2.0x boost)
      const micVolume = options.micVolume !== undefined ? options.micVolume : 100;
      const gainMultiplier = Math.max(0, Math.min(200, micVolume)) / 100;
      const gainNode = this.audioContext.createGain();
      gainNode.gain.setValueAtTime(gainMultiplier, this.audioContext.currentTime);
      currentNode.connect(gainNode);
      currentNode = gainNode;
      this.micGainNode = gainNode;

      // Dynamics Compressor configured as transparent studio anti-clipping limiter
      const limiter = this.audioContext.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-2.5, this.audioContext.currentTime);
      limiter.knee.setValueAtTime(4.0, this.audioContext.currentTime);
      limiter.ratio.setValueAtTime(16.0, this.audioContext.currentTime);
      limiter.attack.setValueAtTime(0.003, this.audioContext.currentTime);
      limiter.release.setValueAtTime(0.12, this.audioContext.currentTime);
      currentNode.connect(limiter);
      currentNode = limiter;

      // Connect DSP output to recorder destination
      currentNode.connect(destination);
      hasAudio = true;
    }

    // Add desktop audio to mixer if captured
    if (this.screenStream && this.screenStream.getAudioTracks().length > 0) {
      const systemSource = this.audioContext.createMediaStreamSource(this.screenStream);
      systemSource.connect(destination);
      hasAudio = true;
    }

    if (hasAudio) {
      const mixedAudioTrack = destination.stream.getAudioTracks()[0];
      if (mixedAudioTrack) {
        tracks.push(mixedAudioTrack);
      }
    }

    const combinedStream = new MediaStream(tracks);

    // 4. Initialize MediaRecorder with hardware-accelerated codecs
    let mimeType = 'video/webm; codecs=h264,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm; codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm; codecs=vp8,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }
      }
    }

    const targetBitrate =
      options.resolution === '4k' ? 12000000 : options.resolution === '720p' ? 3000000 : 6000000;

    this.mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: targetBitrate,
      audioBitsPerSecond: 128000
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.currentSceneChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(1000); // 1-second chunks
    this.currentSceneStartTime = Date.now();

    this.durationInterval = setInterval(() => {
      if (this.onDurationUpdate && this.mediaRecorder?.state === 'recording') {
        const activeTake = Date.now() - this.currentSceneStartTime;
        const sceneMs = this.currentSceneAccumulatedMs + activeTake;
        const prevScenesMs = this.scenes.reduce((acc, s) => acc + s.durationMs, 0);
        const totalMs = prevScenesMs + sceneMs;
        this.onDurationUpdate(totalMs, sceneMs, this.scenes.length + 1);
      }
    }, 250);
  }

  pause() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.currentSceneAccumulatedMs += Date.now() - this.currentSceneStartTime;
      this.mediaRecorder.pause();
    }
  }

  resume() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.currentSceneStartTime = Date.now();
      this.mediaRecorder.resume();
    }
  }

  retakeCurrentScene() {
    this.currentSceneChunks = [];
    this.currentSceneAccumulatedMs = 0;
    this.currentSceneStartTime = Date.now();
    if (this.onDurationUpdate) {
      const prevMs = this.scenes.reduce((acc, s) => acc + s.durationMs, 0);
      this.onDurationUpdate(prevMs, 0, this.scenes.length + 1);
    }
  }

  sealCurrentScene(name?: string) {
    const activeTake = this.mediaRecorder?.state === 'recording' ? (Date.now() - this.currentSceneStartTime) : 0;
    const sceneDuration = this.currentSceneAccumulatedMs + activeTake;
    
    if (this.currentSceneChunks.length > 0) {
      this.scenes.push({
        id: 'scene_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        name: name || `Cena ${this.scenes.length + 1}`,
        durationMs: Math.max(500, sceneDuration),
        chunks: [...this.currentSceneChunks]
      });
    }
    this.currentSceneChunks = [];
    this.currentSceneAccumulatedMs = 0;
    this.currentSceneStartTime = Date.now();
  }

  deleteScene(index: number) {
    if (index >= 0 && index < this.scenes.length) {
      this.scenes.splice(index, 1);
      this.scenes.forEach((s, idx) => {
        if (s.name.startsWith('Cena ')) {
          s.name = `Cena ${idx + 1}`;
        }
      });
      if (this.onDurationUpdate) {
        const prevMs = this.scenes.reduce((acc, s) => acc + s.durationMs, 0);
        this.onDurationUpdate(prevMs, 0, this.scenes.length + 1);
      }
    }
  }

  getScenes(): { id: string; name: string; durationMs: number }[] {
    return this.scenes.map((s) => ({ id: s.id, name: s.name, durationMs: s.durationMs }));
  }

  getCurrentSceneNumber(): number {
    return this.scenes.length + 1;
  }

  setMicMuted(muted: boolean): boolean {
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
      return !muted;
    }
    return false;
  }

  setMicGain(volume: number) {
    if (this.micGainNode && this.audioContext) {
      const mult = Math.max(0, Math.min(200, volume)) / 100;
      this.micGainNode.gain.setValueAtTime(mult, this.audioContext.currentTime);
    }
  }

  async stop(): Promise<{ blob: Blob; buffer: ArrayBuffer; durationMs: number; chapters: ChapterItem[] }> {
    clearInterval(this.durationInterval);

    const activeTake = this.mediaRecorder?.state === 'recording' ? (Date.now() - this.currentSceneStartTime) : 0;
    const finalSceneDuration = this.currentSceneAccumulatedMs + activeTake;

    if (this.currentSceneChunks.length > 0) {
      this.scenes.push({
        id: 'scene_' + Date.now(),
        name: `Cena ${this.scenes.length + 1}`,
        durationMs: Math.max(500, finalSceneDuration),
        chunks: [...this.currentSceneChunks]
      });
      this.currentSceneChunks = [];
    }

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('Recorder not initialized'));
      }

      this.mediaRecorder.onstop = async () => {
        const allChunks = this.scenes.flatMap((s) => s.chunks);
        const blob = new Blob(allChunks, { type: 'video/webm' });
        const buffer = await blob.arrayBuffer();

        const totalDurationMs = this.scenes.reduce((acc, s) => acc + s.durationMs, 0);

        let runningMs = 0;
        const chapters: ChapterItem[] = this.scenes.length > 1
          ? this.scenes.map((s, idx) => {
              const chap: ChapterItem = {
                id: s.id,
                time: Math.round((runningMs / 1000) * 10) / 10,
                title: s.name || `Cena ${idx + 1}`
              };
              runningMs += s.durationMs;
              return chap;
            })
          : [];

        // Cleanup tracks
        this.isCroppingActive = false;
        if (this.cropAnimFrame) {
          cancelAnimationFrame(this.cropAnimFrame);
          this.cropAnimFrame = null;
        }
        if (this.cropVideoElement) {
          this.cropVideoElement.pause();
          this.cropVideoElement.srcObject = null;
          this.cropVideoElement.remove();
          this.cropVideoElement = null;
        }
        if (this.rawScreenStream) {
          this.rawScreenStream.getTracks().forEach((t) => t.stop());
          this.rawScreenStream = null;
        }
        this.screenStream?.getTracks().forEach((t) => t.stop());
        this.micStream?.getTracks().forEach((t) => t.stop());
        this.audioContext?.close().catch(() => {});

        resolve({ blob, buffer, durationMs: totalDurationMs, chapters });
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    });
  }

  cleanup() {
    clearInterval(this.durationInterval);
    this.isCroppingActive = false;
    if (this.cropAnimFrame) {
      cancelAnimationFrame(this.cropAnimFrame);
      this.cropAnimFrame = null;
    }
    if (this.cropVideoElement) {
      this.cropVideoElement.pause();
      this.cropVideoElement.srcObject = null;
      this.cropVideoElement.remove();
      this.cropVideoElement = null;
    }
    if (this.rawScreenStream) {
      this.rawScreenStream.getTracks().forEach((t) => t.stop());
      this.rawScreenStream = null;
    }
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close().catch(() => {});
    this.micGainNode = null;
    this.mediaRecorder = null;
    this.currentSceneChunks = [];
    this.scenes = [];
    this.currentSceneAccumulatedMs = 0;
  }
}

export const recorderService = new RecorderService();
