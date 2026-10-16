import { RecordingOptions } from '../types';

export class RecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private screenStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private startTime: number = 0;
  private durationInterval: any = null;
  private onDurationUpdate?: (ms: number) => void;

  async start(options: RecordingOptions, onDuration?: (ms: number) => void): Promise<void> {
    this.recordedChunks = [];
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
      try {
        this.screenStream = await navigator.mediaDevices.getUserMedia({
          audio: options.includeSystemAudio
            ? {
                mandatory: {
                  chromeMediaSource: 'desktop'
                }
              } as any
            : false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: options.sourceId,
              minWidth: 1280,
              maxWidth: width,
              minHeight: 720,
              maxHeight: height,
              maxFrameRate: fps
            }
          } as any
        });
      } catch (err) {
        console.warn('Failed desktop audio/video constraint, falling back to standard displayMedia:', err);
        // Fallback for modern standard getDisplayMedia
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { max: width }, height: { max: height }, frameRate: fps },
          audio: options.includeSystemAudio
        });
      }

      // If custom-area mode is active with defined crop coordinates
      if (options.mode === 'custom-area' && options.cropArea && this.screenStream) {
        try {
          const crop = options.cropArea;
          const rawStream = this.screenStream;
          const hiddenVideo = document.createElement('video');
          hiddenVideo.srcObject = rawStream;
          hiddenVideo.muted = true;
          await hiddenVideo.play();

          const canvas = document.createElement('canvas');
          canvas.width = crop.width;
          canvas.height = crop.height;
          const ctx = canvas.getContext('2d');

          const renderCrop = () => {
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
              if (ctx && hiddenVideo.readyState >= 2) {
                ctx.drawImage(
                  hiddenVideo,
                  crop.x,
                  crop.y,
                  crop.width,
                  crop.height,
                  0,
                  0,
                  crop.width,
                  crop.height
                );
              }
              requestAnimationFrame(renderCrop);
            }
          };
          renderCrop();

          const croppedStream = (canvas as any).captureStream(fps);
          rawStream.getAudioTracks().forEach((t) => croppedStream.addTrack(t));
          this.screenStream = croppedStream;
        } catch (cropErr) {
          console.warn('Error applying crop to stream:', cropErr);
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
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: options.audioDeviceId
          ? { deviceId: { exact: options.audioDeviceId }, echoCancellation: true, noiseSuppression: true }
          : true,
        video: false
      });
    } catch (err) {
      console.warn('No microphone available or permission denied:', err);
      this.micStream = null;
    }

    // 3. Audio mixing with AudioContext
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

    // Add microphone to mixer
    if (this.micStream && this.micStream.getAudioTracks().length > 0) {
      const micSource = this.audioContext.createMediaStreamSource(this.micStream);
      micSource.connect(destination);
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

    // 4. Initialize MediaRecorder with best supported codecs
    let mimeType = 'video/webm; codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm; codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
    }

    this.mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: options.resolution === '4k' ? 12000000 : 6000000
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(1000); // 1-second chunks
    this.startTime = Date.now();

    this.durationInterval = setInterval(() => {
      if (this.onDurationUpdate && this.mediaRecorder?.state === 'recording') {
        this.onDurationUpdate(Date.now() - this.startTime);
      }
    }, 500);
  }

  pause() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }

  resume() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }

  async stop(): Promise<{ blob: Blob; buffer: ArrayBuffer; durationMs: number }> {
    clearInterval(this.durationInterval);
    const durationMs = Date.now() - this.startTime;

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('Recorder not initialized'));
      }

      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const buffer = await blob.arrayBuffer();

        // Cleanup tracks
        this.screenStream?.getTracks().forEach((t) => t.stop());
        this.micStream?.getTracks().forEach((t) => t.stop());
        this.audioContext?.close().catch(() => {});

        resolve({ blob, buffer, durationMs });
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    });
  }

  cleanup() {
    clearInterval(this.durationInterval);
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close().catch(() => {});
    this.mediaRecorder = null;
    this.recordedChunks = [];
  }
}

export const recorderService = new RecorderService();
