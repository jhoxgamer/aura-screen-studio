const SOUND_MAP: Record<string, string> = {
  start: '/assets/sounds/loom_start.mp3',
  stop: '/assets/sounds/end-recording.mp3',
  pause: '/assets/sounds/loom_pause.mp3',
  complete: '/assets/sounds/loom_complete.mp3',
  countdown: '/assets/sounds/start-recording.mp3',
  camera: '/assets/sounds/screenshot-camera-shutter.mp3',
  airhorn: '/assets/sounds/airhorn.mp3'
};

class AudioService {
  private cache: Map<string, HTMLAudioElement> = new Map();

  play(soundName: keyof typeof SOUND_MAP | string) {
    try {
      const src = SOUND_MAP[soundName];
      if (!src) return;

      let audio = this.cache.get(src);
      if (!audio) {
        audio = new Audio(src);
        audio.volume = 0.75;
        this.cache.set(src, audio);
      } else {
        audio.currentTime = 0;
      }

      audio.play().catch((err) => {
        // Audio autoplay policy fallback
        console.warn('Audio playback prevented or unsupported:', err);
      });
    } catch (e) {
      console.warn('Audio service error:', e);
    }
  }

  initSoundListeners() {
    if (window.electronAPI?.onPlaySound) {
      return window.electronAPI.onPlaySound((sound: string) => {
        this.play(sound);
      });
    }
    return () => {};
  }
}

export const audioService = new AudioService();
