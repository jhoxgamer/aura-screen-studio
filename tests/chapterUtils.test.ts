import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateChaptersFromScenes,
  formatChapterTime,
  validateChapterTimeline,
  type SceneMeta
} from '../src/utils/chapterUtils.ts';

describe('Chapter Utilities', () => {
  describe('generateChaptersFromScenes', () => {
    test('returns empty array if zero or only 1 scene is recorded (no split required)', () => {
      assert.deepEqual(generateChaptersFromScenes([]), []);
      assert.deepEqual(
        generateChaptersFromScenes([{ id: 'sc1', name: 'Cena 1', durationMs: 15000 }]),
        []
      );
    });

    test('generates incremental chapters starting at 0.0s for multi-scene recordings', () => {
      const scenes: SceneMeta[] = [
        { id: 'sc1', name: 'Introdução ao Produto', durationMs: 10000 },
        { id: 'sc2', name: 'Demonstração dos Atalhos', durationMs: 25000 },
        { id: 'sc3', name: 'Conclusão e Encerramento', durationMs: 15000 }
      ];

      const chapters = generateChaptersFromScenes(scenes);
      assert.equal(chapters.length, 3);

      // Chapter 1 starts at 0s
      assert.equal(chapters[0].id, 'sc1');
      assert.equal(chapters[0].title, 'Introdução ao Produto');
      assert.equal(chapters[0].time, 0.0);

      // Chapter 2 starts after scene 1 (10s)
      assert.equal(chapters[1].id, 'sc2');
      assert.equal(chapters[1].title, 'Demonstração dos Atalhos');
      assert.equal(chapters[1].time, 10.0);

      // Chapter 3 starts after scene 1 + scene 2 (35s)
      assert.equal(chapters[2].id, 'sc3');
      assert.equal(chapters[2].title, 'Conclusão e Encerramento');
      assert.equal(chapters[2].time, 35.0);
    });
  });

  describe('formatChapterTime', () => {
    test('formats chapter seconds into standard mm:ss format', () => {
      assert.equal(formatChapterTime(0), '00:00');
      assert.equal(formatChapterTime(45), '00:45');
      assert.equal(formatChapterTime(75), '01:15');
      assert.equal(formatChapterTime(630), '10:30');
    });

    test('handles negative or invalid seconds safely', () => {
      assert.equal(formatChapterTime(-10), '00:00');
      assert.equal(formatChapterTime(NaN), '00:00');
    });
  });

  describe('validateChapterTimeline', () => {
    test('accepts valid ascending chapter timestamps within duration', () => {
      const chapters = [
        { id: '1', time: 0, title: 'Intro' },
        { id: '2', time: 15.5, title: 'Parte 2' },
        { id: '3', time: 42.0, title: 'Fim' }
      ];
      assert.ok(validateChapterTimeline(chapters, 60));
    });

    test('rejects negative chapter timestamp', () => {
      const chapters = [{ id: '1', time: -5, title: 'Bad Time' }];
      assert.equal(validateChapterTimeline(chapters, 60), false);
    });

    test('rejects chapter timestamp exceeding total duration', () => {
      const chapters = [
        { id: '1', time: 0, title: 'Intro' },
        { id: '2', time: 70, title: 'Out of bounds' }
      ];
      assert.equal(validateChapterTimeline(chapters, 60), false);
    });

    test('rejects non-ascending chapter timestamps', () => {
      const chapters = [
        { id: '1', time: 10, title: 'Intro' },
        { id: '2', time: 5, title: 'Back in time' }
      ];
      assert.equal(validateChapterTimeline(chapters, 60), false);
    });
  });
});
