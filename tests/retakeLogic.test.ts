import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

interface MockScene {
  id: string;
  name: string;
  durationMs: number;
}

class SceneSessionManager {
  scenes: MockScene[] = [];
  currentAccumulatedMs: number = 0;
  currentStartTime: number = 0;
  isRecording: boolean = false;

  startTake(now: number = Date.now()) {
    this.isRecording = true;
    this.currentStartTime = now;
  }

  pauseTake(now: number) {
    if (this.isRecording) {
      this.currentAccumulatedMs += now - this.currentStartTime;
      this.isRecording = false;
    }
  }

  resumeTake(now: number) {
    if (!this.isRecording) {
      this.isRecording = true;
      this.currentStartTime = now;
    }
  }

  retakeCurrent(now: number = Date.now()) {
    this.currentAccumulatedMs = 0;
    this.currentStartTime = now;
  }

  sealScene(now: number, name?: string) {
    const activeTake = this.isRecording ? now - this.currentStartTime : 0;
    const duration = this.currentAccumulatedMs + activeTake;
    this.scenes.push({
      id: `scene_${this.scenes.length + 1}`,
      name: name || `Cena ${this.scenes.length + 1}`,
      durationMs: Math.max(500, duration)
    });
    this.currentAccumulatedMs = 0;
    this.currentStartTime = now;
  }

  deleteScene(index: number) {
    if (index >= 0 && index < this.scenes.length) {
      this.scenes.splice(index, 1);
      this.scenes.forEach((s, idx) => {
        if (s.name.startsWith('Cena ')) {
          s.name = `Cena ${idx + 1}`;
        }
      });
    }
  }

  getTotalDuration(now: number = Date.now()): number {
    const prevTotal = this.scenes.reduce((acc, s) => acc + s.durationMs, 0);
    const activeTake = this.isRecording ? now - this.currentStartTime : 0;
    return prevTotal + this.currentAccumulatedMs + activeTake;
  }
}

describe('Scene & Retake Logic Session', () => {
  test('accumulates duration across consecutive scenes', () => {
    const session = new SceneSessionManager();
    const t0 = 1000;
    session.startTake(t0);

    // Scene 1 lasts 10,000ms
    session.sealScene(t0 + 10000);
    assert.equal(session.scenes.length, 1);
    assert.equal(session.scenes[0].durationMs, 10000);
    assert.equal(session.getTotalDuration(t0 + 10000), 10000);

    // Scene 2 lasts 20,000ms
    session.sealScene(t0 + 30000);
    assert.equal(session.scenes.length, 2);
    assert.equal(session.scenes[1].durationMs, 20000);
    assert.equal(session.getTotalDuration(t0 + 30000), 30000);
  });

  test('retaking current scene resets only active take while keeping prior scenes intact', () => {
    const session = new SceneSessionManager();
    const t0 = 1000;
    session.startTake(t0);

    // Complete Scene 1
    session.sealScene(t0 + 15000); // 15s
    assert.equal(session.scenes.length, 1);

    // Start Scene 2, record 8s, then hit Retake
    const tScene2 = t0 + 15000;
    // User stumbled at 8s
    session.retakeCurrent(tScene2 + 8000);

    // Active take is reset: total duration equals Scene 1 only
    assert.equal(session.getTotalDuration(tScene2 + 8000), 15000);

    // Now record clean take of Scene 2 for 12s
    session.sealScene(tScene2 + 8000 + 12000);
    assert.equal(session.scenes.length, 2);
    assert.equal(session.scenes[1].durationMs, 12000);
    assert.equal(session.getTotalDuration(tScene2 + 20000), 27000);
  });

  test('deleting a scene renumbers remaining default scene titles correctly', () => {
    const session = new SceneSessionManager();
    session.scenes = [
      { id: '1', name: 'Cena 1', durationMs: 5000 },
      { id: '2', name: 'Cena 2', durationMs: 8000 },
      { id: '3', name: 'Cena 3', durationMs: 12000 }
    ];

    session.deleteScene(1); // delete Cena 2
    assert.equal(session.scenes.length, 2);
    assert.equal(session.scenes[0].name, 'Cena 1');
    assert.equal(session.scenes[1].name, 'Cena 2'); // was Cena 3
    assert.equal(session.scenes[1].durationMs, 12000);
  });
});
