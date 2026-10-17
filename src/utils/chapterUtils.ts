import type { ChapterItem } from '../types/index.ts';

export interface SceneMeta {
  id: string;
  name: string;
  durationMs: number;
}

export function generateChaptersFromScenes(scenes: SceneMeta[]): ChapterItem[] {
  if (!scenes || scenes.length <= 1) return [];

  let runningMs = 0;
  return scenes.map((scene, idx) => {
    const chapterTimeSec = Math.round((runningMs / 1000) * 10) / 10;
    const item: ChapterItem = {
      id: scene.id || `scene_${idx + 1}`,
      time: chapterTimeSec,
      title: scene.name || `Cena ${idx + 1}`
    };
    runningMs += scene.durationMs;
    return item;
  });
}

export function formatChapterTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function validateChapterTimeline(chapters: ChapterItem[], totalDurationSec: number): boolean {
  if (!chapters || chapters.length === 0) return true;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].time < 0) return false;
    if (totalDurationSec > 0 && chapters[i].time > totalDurationSec) return false;
    if (i > 0 && chapters[i].time <= chapters[i - 1].time) return false;
  }
  return true;
}
