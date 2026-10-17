import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  formatDurationHuman,
  formatFileSize,
  getResolutionDimensions,
  getAspectRatio,
  formatRelativeDate
} from '../src/utils/formatters.ts';

describe('Formatters Utilities', () => {
  describe('formatDuration', () => {
    test('formats zero or invalid milliseconds as 00:00', () => {
      assert.equal(formatDuration(0), '00:00');
      assert.equal(formatDuration(-1000), '00:00');
      assert.equal(formatDuration(NaN), '00:00');
    });

    test('formats sub-minute duration correctly', () => {
      assert.equal(formatDuration(5000), '00:05');
      assert.equal(formatDuration(42000), '00:42');
    });

    test('formats multi-minute duration correctly', () => {
      assert.equal(formatDuration(65000), '01:05');
      assert.equal(formatDuration(599000), '09:59');
      assert.equal(formatDuration(600000), '10:00');
    });

    test('formats multi-hour duration correctly with h:mm:ss', () => {
      assert.equal(formatDuration(3665000), '1:01:05');
      assert.equal(formatDuration(7200000), '2:00:00');
    });
  });

  describe('formatDurationHuman', () => {
    test('formats seconds in human readable text', () => {
      assert.equal(formatDurationHuman(15000), '15s');
    });

    test('formats minutes and seconds in human readable text', () => {
      assert.equal(formatDurationHuman(125000), '2m 5s');
    });

    test('formats hours, minutes and seconds in human readable text', () => {
      assert.equal(formatDurationHuman(3665000), '1h 1m 5s');
    });
  });

  describe('formatFileSize', () => {
    test('formats 0 bytes', () => {
      assert.equal(formatFileSize(0), '0 B');
    });

    test('formats bytes', () => {
      assert.equal(formatFileSize(512), '512 B');
    });

    test('formats kilobytes', () => {
      assert.equal(formatFileSize(1024), '1.0 KB');
      assert.equal(formatFileSize(1536), '1.5 KB');
    });

    test('formats megabytes', () => {
      assert.equal(formatFileSize(1048576), '1.0 MB');
      assert.equal(formatFileSize(15728640), '15.0 MB');
    });

    test('formats gigabytes', () => {
      assert.equal(formatFileSize(1073741824), '1.0 GB');
      assert.equal(formatFileSize(2684354560), '2.5 GB');
    });
  });

  describe('getResolutionDimensions', () => {
    test('returns 1280x720 for 720p', () => {
      assert.deepEqual(getResolutionDimensions('720p'), { width: 1280, height: 720 });
    });

    test('returns 1920x1080 for 1080p', () => {
      assert.deepEqual(getResolutionDimensions('1080p'), { width: 1920, height: 1080 });
    });

    test('returns 3840x2160 for 4k', () => {
      assert.deepEqual(getResolutionDimensions('4k'), { width: 3840, height: 2160 });
    });
  });

  describe('getAspectRatio', () => {
    test('calculates standard 16:9 widescreen ratio', () => {
      assert.equal(getAspectRatio(1920, 1080), '16:9');
      assert.equal(getAspectRatio(1280, 720), '16:9');
      assert.equal(getAspectRatio(3840, 2160), '16:9');
    });

    test('calculates 4:3 standard display ratio', () => {
      assert.equal(getAspectRatio(1024, 768), '4:3');
      assert.equal(getAspectRatio(1600, 1200), '4:3');
    });

    test('calculates 1:1 square ratio', () => {
      assert.equal(getAspectRatio(800, 800), '1:1');
    });

    test('calculates 9:16 vertical video ratio', () => {
      assert.equal(getAspectRatio(1080, 1920), '9:16');
    });
  });

  describe('formatRelativeDate', () => {
    test('handles zero or invalid timestamps', () => {
      assert.equal(formatRelativeDate(0), '');
      assert.equal(formatRelativeDate(NaN), '');
    });

    test('formats recent timestamps as Agora mesmo', () => {
      assert.equal(formatRelativeDate(Date.now() - 10000), 'Agora mesmo');
    });

    test('formats minute differences', () => {
      assert.equal(formatRelativeDate(Date.now() - 5 * 60 * 1000), 'Há 5 min');
    });

    test('formats hour differences', () => {
      assert.equal(formatRelativeDate(Date.now() - 3 * 3600 * 1000), 'Há 3h');
    });

    test('formats yesterday', () => {
      assert.equal(formatRelativeDate(Date.now() - 25 * 3600 * 1000), 'Ontem');
    });
  });
});
