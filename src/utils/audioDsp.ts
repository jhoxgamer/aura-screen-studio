/**
 * Professional Web Audio DSP calculation utilities
 */

export interface NoiseReductionConfig {
  highpassFreq: number;
  notchFreqs: number[];
  description: string;
}

export function volumeToGain(volume: number): number {
  if (typeof volume !== 'number' || isNaN(volume)) return 1.0;
  const clamped = Math.max(0, Math.min(200, volume));
  return clamped / 100;
}

export function gainToDecibels(volume: number): string {
  if (volume <= 0) return 'Mudo';
  if (volume === 100) return '0.0 dB (Padrão)';
  const db = 20 * Math.log10(volume / 100);
  const sign = db > 0 ? '+' : '';
  return `${sign}${db.toFixed(1)} dB`;
}

export function getNoiseReductionPreset(level: 'off' | 'low' | 'medium' | 'high'): NoiseReductionConfig {
  switch (level) {
    case 'low':
      return {
        highpassFreq: 80,
        notchFreqs: [3500],
        description: 'Leve (Corte de 80Hz para zumbidos elétricos e vibrações de mesa)'
      };
    case 'medium':
      return {
        highpassFreq: 120,
        notchFreqs: [3500, 7500],
        description: 'Moderado (Corte de 120Hz + filtros notch para ventoinhas e computadores)'
      };
    case 'high':
      return {
        highpassFreq: 160,
        notchFreqs: [3500, 6000, 7500],
        description: 'Agressivo (Corte de 160Hz + múltiplos filtros notch para ruídos intensos de ar condicionado)'
      };
    case 'off':
    default:
      return {
        highpassFreq: 0,
        notchFreqs: [],
        description: 'Desativado (Sinal acústico transparente sem filtragem espectral)'
      };
  }
}

export const STUDIO_LIMITER_PARAMS = {
  threshold: -2.5, // dB
  knee: 4.0,       // dB
  ratio: 16.0,     // studio brickwall limiter ratio
  attack: 0.003,   // 3ms ultra-fast transient catcher
  release: 0.12    // 120ms natural musical release
};

export const VOICE_PRESENCE_PARAMS = {
  frequency: 3200, // 3.2 kHz vocal clarity sweet spot
  gain: 3.5,       // +3.5 dB boost for speech intelligibility
  Q: 1.2
};

export const DE_ESSER_PARAMS = {
  frequency: 6800, // 6.8 kHz sibilance notch
  gain: -3.0,      // -3.0 dB attenuation for harsh 's' sounds
  Q: 1.5
};

export const STUDIO_WARMTH_PARAMS = {
  frequency: 90,   // 90 Hz gentle rolloff
  gain: 1.5,       // +1.5 dB subtle chest resonance
  Q: 0.707
};

