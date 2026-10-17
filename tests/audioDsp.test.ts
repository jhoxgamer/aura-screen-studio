import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  volumeToGain,
  gainToDecibels,
  getNoiseReductionPreset,
  STUDIO_LIMITER_PARAMS
} from '../src/utils/audioDsp.ts';

describe('Audio DSP Utilities', () => {
  describe('volumeToGain', () => {
    test('normalizes 100% volume to 1.0 linear gain', () => {
      assert.equal(volumeToGain(100), 1.0);
    });

    test('scales 200% volume to 2.0 linear gain (boost)', () => {
      assert.equal(volumeToGain(200), 2.0);
    });

    test('scales 0% volume to 0.0 gain (mute)', () => {
      assert.equal(volumeToGain(0), 0.0);
    });

    test('scales 50% volume to 0.5 gain', () => {
      assert.equal(volumeToGain(50), 0.5);
    });

    test('clamps values exceeding 200% to 2.0', () => {
      assert.equal(volumeToGain(300), 2.0);
    });

    test('clamps negative values to 0.0', () => {
      assert.equal(volumeToGain(-20), 0.0);
    });

    test('handles NaN or invalid inputs safely with default 1.0', () => {
      assert.equal(volumeToGain(NaN), 1.0);
    });
  });

  describe('gainToDecibels', () => {
    test('reports Mudo for 0%', () => {
      assert.equal(gainToDecibels(0), 'Mudo');
      assert.equal(gainToDecibels(-5), 'Mudo');
    });

    test('reports 0.0 dB (Padrão) for 100%', () => {
      assert.equal(gainToDecibels(100), '0.0 dB (Padrão)');
    });

    test('calculates +6.0 dB for 200% boost', () => {
      assert.equal(gainToDecibels(200), '+6.0 dB');
    });

    test('calculates -6.0 dB for 50% attenuation', () => {
      assert.equal(gainToDecibels(50), '-6.0 dB');
    });

    test('calculates -20.0 dB for 10% attenuation', () => {
      assert.equal(gainToDecibels(10), '-20.0 dB');
    });
  });

  describe('getNoiseReductionPreset', () => {
    test('returns uncolored transparent signal for off preset', () => {
      const preset = getNoiseReductionPreset('off');
      assert.equal(preset.highpassFreq, 0);
      assert.deepEqual(preset.notchFreqs, []);
    });

    test('returns 80Hz rumble highpass for low preset', () => {
      const preset = getNoiseReductionPreset('low');
      assert.equal(preset.highpassFreq, 80);
      assert.deepEqual(preset.notchFreqs, [3500]);
    });

    test('returns 120Hz highpass and dual notch for medium preset', () => {
      const preset = getNoiseReductionPreset('medium');
      assert.equal(preset.highpassFreq, 120);
      assert.deepEqual(preset.notchFreqs, [3500, 7500]);
    });

    test('returns 160Hz highpass and multi-notch for aggressive high preset', () => {
      const preset = getNoiseReductionPreset('high');
      assert.equal(preset.highpassFreq, 160);
      assert.deepEqual(preset.notchFreqs, [3500, 6000, 7500]);
    });
  });

  describe('STUDIO_LIMITER_PARAMS', () => {
    test('has transparent anti-clipping brickwall configuration', () => {
      assert.equal(STUDIO_LIMITER_PARAMS.threshold, -2.5);
      assert.equal(STUDIO_LIMITER_PARAMS.ratio, 16.0);
      assert.ok(STUDIO_LIMITER_PARAMS.attack <= 0.005, 'Attack must catch fast transients <= 5ms');
      assert.ok(STUDIO_LIMITER_PARAMS.release >= 0.1, 'Release must avoid pumping >= 100ms');
    });
  });
});
