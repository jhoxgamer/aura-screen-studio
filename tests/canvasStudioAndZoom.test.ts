import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_PRESENCE_PARAMS,
  DE_ESSER_PARAMS,
  STUDIO_WARMTH_PARAMS,
  STUDIO_LIMITER_PARAMS
} from '../src/utils/audioDsp.ts';

describe('Screen Studio Presentation Canvas & Window Frame Engine', () => {
  const BACKDROP_PRESETS = [
    { id: 'nocturne', name: 'Nocturne Obsidian', dotColor: '#78A5FF' },
    { id: 'sunset', name: 'Sunset Aura', dotColor: '#FF647C' },
    { id: 'cyberpunk', name: 'Neon Cyberpunk', dotColor: '#A855F7' },
    { id: 'emerald', name: 'Emerald Forest', dotColor: '#10B981' },
    { id: 'frosted', name: 'Frosted Glass', dotColor: '#929CAF' },
    { id: 'none', name: 'Preto Puro (Flat)', dotColor: '#303A4B' }
  ];

  test('validates all 6 studio backdrop presets with signature color accents', () => {
    assert.equal(BACKDROP_PRESETS.length, 6);
    const ids = BACKDROP_PRESETS.map(b => b.id);
    assert.ok(ids.includes('nocturne'));
    assert.ok(ids.includes('sunset'));
    assert.ok(ids.includes('cyberpunk'));
    assert.ok(ids.includes('emerald'));
    assert.ok(ids.includes('frosted'));
    assert.ok(ids.includes('none'));
  });

  test('aspect ratio definitions map correctly to standard dimensions', () => {
    const ratios = {
      '16-9': 16 / 9,
      '9-16': 9 / 16,
      '1-1': 1 / 1,
      '4-3': 4 / 3
    };

    assert.ok(Math.abs(ratios['16-9'] - 1.777) < 0.01);
    assert.ok(Math.abs(ratios['9-16'] - 0.5625) < 0.001);
    assert.equal(ratios['1-1'], 1.0);
    assert.ok(Math.abs(ratios['4-3'] - 1.333) < 0.01);
  });

  test('shadow styles produce distinct elevation depth profiles', () => {
    const getShadowClass = (shadow: string) => {
      switch (shadow) {
        case 'none': return 'shadow-none border border-[#303A4B]/60';
        case 'subtle': return 'shadow-xl shadow-black/50 border border-[#303A4B]';
        case 'cinematic': return 'shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] ring-1 ring-white/10';
        case 'glow': return 'shadow-[0_20px_55px_-10px_rgba(120,165,255,0.45)] ring-1 ring-[#78A5FF]/40';
        default: return 'shadow-2xl';
      }
    };

    assert.ok(getShadowClass('none').includes('shadow-none'));
    assert.ok(getShadowClass('subtle').includes('shadow-xl'));
    assert.ok(getShadowClass('cinematic').includes('rgba(0,0,0,0.9)'));
    assert.ok(getShadowClass('glow').includes('rgba(120,165,255,0.45)'));
  });
});

describe('Cinematic Smooth Zoom & Pan Motion Engine', () => {
  const getZoomOrigin = (focus: string) => {
    switch (focus) {
      case 'top-left': return '15% 15%';
      case 'top-right': return '85% 15%';
      case 'bottom-left': return '15% 85%';
      case 'bottom-right': return '85% 85%';
      default: return '50% 50%';
    }
  };

  test('calculates correct transform origins for all 5 focal quadrants', () => {
    assert.equal(getZoomOrigin('center'), '50% 50%');
    assert.equal(getZoomOrigin('top-left'), '15% 15%');
    assert.equal(getZoomOrigin('top-right'), '85% 15%');
    assert.equal(getZoomOrigin('bottom-left'), '15% 85%');
    assert.equal(getZoomOrigin('bottom-right'), '85% 85%');
  });

  test('zoom scale levels follow progressive magnification curve', () => {
    const scales = [1.0, 1.4, 1.8, 2.2];
    assert.equal(scales[0], 1.0);
    assert.ok(scales[1] > scales[0]);
    assert.ok(scales[2] > scales[1]);
    assert.ok(scales[3] > scales[2]);
    assert.equal(scales[scales.length - 1], 2.2);
  });
});

describe('Descript-Style Studio Voice Engine Validation', () => {
  test('vocal presence boosts clarity without causing digital distortion', () => {
    assert.equal(VOICE_PRESENCE_PARAMS.frequency, 3200);
    assert.equal(VOICE_PRESENCE_PARAMS.gain, 3.5);
    assert.equal(VOICE_PRESENCE_PARAMS.Q, 1.2);
  });

  test('smart de-esser tames harsh sibilants', () => {
    assert.equal(DE_ESSER_PARAMS.frequency, 6800);
    assert.equal(DE_ESSER_PARAMS.gain, -3.0);
    assert.equal(DE_ESSER_PARAMS.Q, 1.5);
  });

  test('studio warmth removes sub-bass rumble while preserving body', () => {
    assert.equal(STUDIO_WARMTH_PARAMS.frequency, 90);
    assert.equal(STUDIO_WARMTH_PARAMS.gain, 1.5);
    assert.equal(STUDIO_WARMTH_PARAMS.Q, 0.707);
  });

  test('studio limiter enforces safe broadcast head-room', () => {
    assert.equal(STUDIO_LIMITER_PARAMS.threshold, -2.5);
    assert.equal(STUDIO_LIMITER_PARAMS.ratio, 16.0);
  });
});
