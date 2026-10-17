// Sound effects manager with Web Audio API synthesizer & audio files
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
  private audioCtx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  // Synthesize crystal-clear Aura & Zoom tones via Web Audio API
  private synthChime(
    type:
      | 'start'
      | 'stop'
      | 'pause'
      | 'complete'
      | 'countdown'
      | 'chime'
      | 'dingdong'
      | 'pop'
      | 'snap'
      | 'laser'
      | 'whiteboard'
  ) {
    const ctx = this.getContext();
    if (!ctx) return false;

    try {
      const now = ctx.currentTime;

      if (type === 'start') {
        // Futuristic ascending twin-tone chime
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now); // C5
        osc1.frequency.exponentialRampToValueAtTime(880, now + 0.18); // A5

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(659.25, now); // E5
        osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.18); // C6

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.45);
        osc2.stop(now + 0.45);
        return true;
      }

      if (type === 'stop') {
        // Satisfying soft descending chime
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.25);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.35);
        return true;
      }

      if (type === 'pause') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(493.88, now); // B4
        osc.frequency.exponentialRampToValueAtTime(329.63, now + 0.12); // E4

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.15);
        return true;
      }

      if (type === 'countdown') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(784, now); // G5

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.12);
        return true;
      }

      if (type === 'complete') {
        // Triumphant chord (Aura Chord: C5 - E5 - G5 - C6)
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.04);
          gain.gain.setValueAtTime(0.12, now + idx * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.04);
          osc.stop(now + 0.6);
        });
        return true;
      }

      // Zoom-inspired sound effects:
      if (type === 'chime' || (type as string) === 'dingdong') {
        // Zoom signature ding-dong two-tone chime
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.0, now + 0.12); // A5

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.2);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.55);
        return true;
      }

      if (type === 'pop' || (type as string) === 'snap') {
        // Crisp tactile snap / stamp pop
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.03);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.08);
        return true;
      }

      if (type === 'laser') {
        // Laser pointer subtle energy beam
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.06);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.06);
        return true;
      }

      if (type === 'whiteboard') {
        // Smooth whiteboard flip tone
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.22);
        return true;
      }
    } catch (e) {
      console.warn('Synth error:', e);
    }
    return false;
  }

  play(soundName: keyof typeof SOUND_MAP | string) {
    try {
      // 1. Try instant Web Audio API tone synthesis for key events
      const synthTypes = [
        'start',
        'stop',
        'pause',
        'complete',
        'countdown',
        'chime',
        'dingdong',
        'pop',
        'snap',
        'laser',
        'whiteboard'
      ];
      if (synthTypes.includes(soundName)) {
        if (this.synthChime(soundName as any)) return;
      }

      // 2. Fallback to cached audio files
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
        console.warn('Audio playback fallback prevented:', err);
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
