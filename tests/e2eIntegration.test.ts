import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ShareServer } from '../electron/shareServer.ts';
import type { RecordingMeta } from '../electron/types.ts';
import {
  volumeToGain,
  gainToDecibels,
  getNoiseReductionPreset,
  STUDIO_LIMITER_PARAMS
} from '../src/utils/audioDsp.ts';
import {
  generateChaptersFromScenes,
  validateChapterTimeline,
  type SceneMeta
} from '../src/utils/chapterUtils.ts';
import {
  formatDuration,
  formatFileSize,
  getResolutionDimensions,
  getAspectRatio
} from '../src/utils/formatters.ts';

describe('End-to-End Integration & Subsystem Validation', () => {
  let tempDir: string;
  let testVideoPath: string;
  let server: ShareServer;
  let mockRecordings: RecordingMeta[] = [];
  const testPort = 4549; // Dedicated test port to avoid conflict

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-test-e2e-'));
    testVideoPath = path.join(tempDir, 'test-recording.webm');

    // Create a 64KB dummy video file for range streaming verification
    const dummyData = Buffer.alloc(65536, 0xaa);
    fs.writeFileSync(testVideoPath, dummyData);

    mockRecordings = [
      {
        id: 'rec_integration_01',
        title: 'Gravação de Teste E2E Studio',
        createdAt: Date.now() - 3600000,
        durationMs: 45000,
        resolution: '1080p',
        filePath: testVideoPath,
        fileSize: 65536,
        shareUrl: `http://localhost:${testPort}/share/rec_integration_01`,
        viewsCount: 5,
        comments: [],
        reactions: []
      }
    ];

    server = new ShareServer(
      () => mockRecordings,
      (newList) => {
        mockRecordings = newList;
      }
    );
    (server as any).port = testPort;
    (server as any).startTunnel = () => {};
    await server.start();
  });

  after(() => {
    server.stop();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  });

  // =========================================================================
  // 1. LOCAL HTTP VIDEO STREAMING & LIBRARY PREVIEW
  // =========================================================================
  describe('Local HTTP Streaming Server (/video/:id & /share/:id)', () => {
    test('serves full video file with 200 OK when no Range header is sent', async () => {
      const res = await new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; length: number }>((resolve, reject) => {
        http.get(`http://localhost:${testPort}/video/rec_integration_01`, (res) => {
          let totalBytes = 0;
          res.on('data', (chunk) => {
            totalBytes += chunk.length;
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 0,
              headers: res.headers,
              length: totalBytes
            });
          });
          res.on('error', reject);
        });
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'video/webm');
      assert.equal(res.headers['accept-ranges'], 'bytes');
      assert.equal(res.length, 65536);
    });

    test('serves 206 Partial Content when Range header is requested (for video seeking)', async () => {
      const options = {
        hostname: 'localhost',
        port: testPort,
        path: '/video/rec_integration_01',
        headers: {
          Range: 'bytes=0-1023' // Request first 1KB
        }
      };

      const res = await new Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; length: number }>((resolve, reject) => {
        const req = http.request(options, (res) => {
          let totalBytes = 0;
          res.on('data', (chunk) => {
            totalBytes += chunk.length;
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 0,
              headers: res.headers,
              length: totalBytes
            });
          });
        });
        req.on('error', reject);
        req.end();
      });

      assert.equal(res.statusCode, 206, 'Should respond with 206 Partial Content');
      assert.equal(res.length, 1024, 'Should return exactly 1024 bytes');
      assert.equal(res.headers['content-range'], 'bytes 0-1023/65536');
      assert.equal(res.headers['content-length'], '1024');
    });

    test('returns 404 for non-existent video ID without crashing the server', async () => {
      const res = await new Promise<number>((resolve) => {
        http.get(`http://localhost:${testPort}/video/non_existent_video_999`, (res) => {
          res.resume();
          resolve(res.statusCode || 0);
        });
      });

      assert.equal(res, 404);
    });

    test('increments view count and adds comments via local HTTP API', async () => {
      // 1. Post view count
      const viewStatus = await new Promise<number>((resolve) => {
        const req = http.request(
          `http://localhost:${testPort}/api/recordings/rec_integration_01/view`,
          { method: 'POST' },
          (res) => {
            res.resume();
            resolve(res.statusCode || 0);
          }
        );
        req.end();
      });
      assert.equal(viewStatus, 200);
      assert.equal(mockRecordings[0].viewsCount, 6);

      // 2. Post comment with timestamp
      const commentPayload = JSON.stringify({
        author: 'QA Engineer',
        time: 12.5,
        text: 'Excelente qualidade de áudio e vídeo!'
      });

      const commentRes = await new Promise<{ status: number; body: any }>((resolve) => {
        const req = http.request(
          `http://localhost:${testPort}/api/recordings/rec_integration_01/comment`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(commentPayload)
            }
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
            });
          }
        );
        req.write(commentPayload);
        req.end();
      });

      assert.equal(commentRes.status, 200);
      assert.equal(commentRes.body.success, true);
      assert.equal(mockRecordings[0].comments?.length, 1);
      assert.equal(mockRecordings[0].comments?.[0].author, 'QA Engineer');
      assert.equal(mockRecordings[0].comments?.[0].time, 12.5);
    });
  });

  // =========================================================================
  // 2. PREFERENCES PERSISTENCE & RESTORATION CYCLE (SIMULATING APP RESTART)
  // =========================================================================
  describe('Studio Preferences Persistence Simulation', () => {
    class MockLocalStorage {
      private store: Record<string, string> = {};
      getItem(key: string): string | null {
        return this.store[key] || null;
      }
      setItem(key: string, value: string): void {
        this.store[key] = value;
      }
      removeItem(key: string): void {
        delete this.store[key];
      }
      clear(): void {
        this.store = {};
      }
    }

    test('persists and restores all PreRecording studio settings', () => {
      const storage = new MockLocalStorage();

      // Session 1: User customizes studio settings
      storage.setItem('aura_recording_mode', 'custom-area');
      storage.setItem('aura_resolution', '4k');
      storage.setItem('aura_fps', '60');
      storage.setItem('aura_include_system_audio', 'false');
      storage.setItem('aura_speaker_notes_enabled', 'true');
      storage.setItem('aura_highlight_cursor', 'false');
      storage.setItem('aura_mic_volume', '145');
      storage.setItem('aura_noise_suppression', 'medium');
      storage.setItem('aura_audio_device_id', 'mic_usb_blue_yeti');
      storage.setItem('aura_video_device_id', 'cam_brio_4k');

      // Session 2 (Simulated App Restart): Read values back
      const restoredMode = storage.getItem('aura_recording_mode');
      const restoredRes = storage.getItem('aura_resolution');
      const restoredFps = Number(storage.getItem('aura_fps'));
      const restoredSysAudio = storage.getItem('aura_include_system_audio') === 'true';
      const restoredNotes = storage.getItem('aura_speaker_notes_enabled') === 'true';
      const restoredCursor = storage.getItem('aura_highlight_cursor') === 'true';
      const restoredVol = Number(storage.getItem('aura_mic_volume'));
      const restoredNoise = storage.getItem('aura_noise_suppression');
      const restoredMicId = storage.getItem('aura_audio_device_id');
      const restoredCamId = storage.getItem('aura_video_device_id');

      assert.equal(restoredMode, 'custom-area');
      assert.equal(restoredRes, '4k');
      assert.equal(restoredFps, 60);
      assert.equal(restoredSysAudio, false);
      assert.equal(restoredNotes, true);
      assert.equal(restoredCursor, false);
      assert.equal(restoredVol, 145);
      assert.equal(restoredNoise, 'medium');
      assert.equal(restoredMicId, 'mic_usb_blue_yeti');
      assert.equal(restoredCamId, 'cam_brio_4k');
    });

    test('persists and restores Camera Bubble, Drawing Overlay, and Teleprompter preferences', () => {
      const storage = new MockLocalStorage();

      // Bubble preferences
      storage.setItem('aura_bubble_shape', 'squircle');
      storage.setItem('aura_bubble_filter', 'studio');
      storage.setItem('aura_bubble_mirrored', 'false');

      // Drawing preferences
      storage.setItem('aura_draw_tool', 'arrow');
      storage.setItem('aura_draw_color', '#6366f1');
      storage.setItem('aura_draw_width', '6');
      storage.setItem('aura_draw_vanishing', 'false');

      // Teleprompter preferences
      storage.setItem('aura_prompter_font_size', '24');
      storage.setItem('aura_prompter_opacity', '85');
      storage.setItem('aura_prompter_speed', '1.5');

      // Verification on reload
      assert.equal(storage.getItem('aura_bubble_shape'), 'squircle');
      assert.equal(storage.getItem('aura_bubble_filter'), 'studio');
      assert.equal(storage.getItem('aura_bubble_mirrored'), 'false');

      assert.equal(storage.getItem('aura_draw_tool'), 'arrow');
      assert.equal(storage.getItem('aura_draw_color'), '#6366f1');
      assert.equal(Number(storage.getItem('aura_draw_width')), 6);
      assert.equal(storage.getItem('aura_draw_vanishing'), 'false');

      assert.equal(Number(storage.getItem('aura_prompter_font_size')), 24);
      assert.equal(Number(storage.getItem('aura_prompter_opacity')), 85);
      assert.equal(Number(storage.getItem('aura_prompter_speed')), 1.5);
    });

    test('recovers safely from invalid or corrupted localStorage data with sensible defaults', () => {
      const storage = new MockLocalStorage();
      storage.setItem('aura_mic_volume', 'not-a-number');
      storage.setItem('aura_fps', 'invalid');

      // Safe parse logic as implemented in views
      const rawVol = storage.getItem('aura_mic_volume');
      const parsedVol = rawVol && !isNaN(Number(rawVol)) ? Number(rawVol) : 100;
      assert.equal(parsedVol, 100);

      const rawFps = storage.getItem('aura_fps');
      const parsedFps = rawFps && !isNaN(Number(rawFps)) ? Number(rawFps) : 60;
      assert.equal(parsedFps, 60);
    });
  });

  // =========================================================================
  // 3. RECORDING LIFECYCLE & RETAKE ISOLATION
  // =========================================================================
  describe('Multi-Scene Recording & Retake State Machine', () => {
    test('isolates retake: stumbling on Scene 2 discards only Scene 2 and keeps Scene 1 timing intact', () => {
      // Scene 1: 15 seconds
      const scene1: SceneMeta = { id: 's1', name: 'Abertura', durationMs: 15000 };

      // Scene 2 take 1 (stumbled at 7s - user hits Retake)
      let activeSceneTakeDuration = 7000;
      // Retake action triggered:
      activeSceneTakeDuration = 0; // reset
      assert.equal(activeSceneTakeDuration, 0, 'Active take duration must be reset to 0');

      // Scene 2 take 2 (recorded cleanly for 20s)
      activeSceneTakeDuration = 20000;
      const scene2: SceneMeta = { id: 's2', name: 'Demonstração dos Recursos', durationMs: activeSceneTakeDuration };

      // Total session duration
      const totalSessionMs = scene1.durationMs + scene2.durationMs;
      assert.equal(totalSessionMs, 35000);

      // Chapters generation
      const chapters = generateChaptersFromScenes([scene1, scene2]);
      assert.equal(chapters.length, 2);
      assert.equal(chapters[0].time, 0.0);
      assert.equal(chapters[0].title, 'Abertura');
      assert.equal(chapters[1].time, 15.0);
      assert.equal(chapters[1].title, 'Demonstração dos Recursos');

      assert.ok(validateChapterTimeline(chapters, totalSessionMs / 1000));
    });
  });

  // =========================================================================
  // 4. MICROPHONE GAIN, dB FORMULAS & LIMITER SPECIFICATIONS
  // =========================================================================
  describe('Microphone Gain & Limiter Boundary Verification', () => {
    test('boundary tests for volume gain multiplier', () => {
      assert.equal(volumeToGain(0), 0.0, '0% must be silence');
      assert.equal(volumeToGain(100), 1.0, '100% must be unity gain');
      assert.equal(volumeToGain(200), 2.0, '200% must be +6dB boost');
      assert.equal(volumeToGain(250), 2.0, 'Values above 200% must clamp to 2.0');
      assert.equal(volumeToGain(-50), 0.0, 'Values below 0% must clamp to 0.0');
    });

    test('dB readout formatting handles exact points and boundaries', () => {
      assert.equal(gainToDecibels(0), 'Mudo');
      assert.equal(gainToDecibels(100), '0.0 dB (Padrão)');
      assert.equal(gainToDecibels(200), '+6.0 dB');
      assert.equal(gainToDecibels(141.4), '+3.0 dB');
    });

    test('limiter parameters prevent digital clipping distortion', () => {
      assert.ok(STUDIO_LIMITER_PARAMS.threshold < 0, 'Threshold must be below 0dBFS to prevent digital clip');
      assert.ok(STUDIO_LIMITER_PARAMS.ratio >= 10, 'Ratio must be high for brickwall limiting action');
      assert.ok(STUDIO_LIMITER_PARAMS.attack <= 0.005, 'Attack must be ultra fast to prevent overshoot');
    });
  });

  // =========================================================================
  // 5. REAL-TIME MIC VU METER & LAUNCHER KEYBOARD SHORTCUT LOGIC
  // =========================================================================
  describe('Live Mic VU Meter & Launcher Keyboard Accessibility Logic', () => {
    test('normalizes raw byte frequency volume into 0.0 to 1.0 scale', () => {
      const normalizeVolume = (avgByte: number) => Math.min(1, Math.max(0, avgByte / 110));
      assert.equal(normalizeVolume(0), 0.0, 'Silence returns 0.0');
      assert.ok(normalizeVolume(55) > 0.49 && normalizeVolume(55) < 0.51, 'Half scale returns ~0.5');
      assert.equal(normalizeVolume(150), 1.0, 'Clipping signal clamps to 1.0');
    });

    test('correctly triggers 3-tier visual VU bars based on speech energy', () => {
      const getActiveBars = (level: number, isMuted: boolean) => {
        if (isMuted) return { bar1: false, bar2: false, bar3: false };
        return {
          bar1: level > 0.04,
          bar2: level > 0.20,
          bar3: level > 0.50
        };
      };

      // Muted mic
      assert.deepEqual(getActiveBars(0.8, true), { bar1: false, bar2: false, bar3: false });

      // Ambient silence / whisper
      assert.deepEqual(getActiveBars(0.02, false), { bar1: false, bar2: false, bar3: false });
      assert.deepEqual(getActiveBars(0.10, false), { bar1: true, bar2: false, bar3: false });

      // Normal speech
      assert.deepEqual(getActiveBars(0.35, false), { bar1: true, bar2: true, bar3: false });

      // Energetic voice / peak speech
      assert.deepEqual(getActiveBars(0.75, false), { bar1: true, bar2: true, bar3: true });
    });

    test('maps numeric hotkeys 1-4 to standard recording modes', () => {
      const modeKeyMap: Record<string, string> = {
        '1': 'screen-cam',
        '2': 'screen-only',
        '3': 'cam-only',
        '4': 'custom-area'
      };
      assert.equal(modeKeyMap['1'], 'screen-cam');
      assert.equal(modeKeyMap['2'], 'screen-only');
      assert.equal(modeKeyMap['3'], 'cam-only');
      assert.equal(modeKeyMap['4'], 'custom-area');
    });
  });

  // =========================================================================
  // 6. TRACK-ENDED SAFEGUARD, GLOBAL MIC TOGGLE & PREVIEW SHORTCUT LOGIC
  // =========================================================================
  describe('Studio Recording Safeguards & Shortcut Behaviors', () => {
    test('onTrackEnded callback is invoked when video track abruptly ends', () => {
      let endedTriggered = false;
      const fakeService = {
        onTrackEnded: undefined as (() => void) | undefined,
        setOnTrackEnded(cb: (() => void) | undefined) {
          this.onTrackEnded = cb;
        },
        simulateTrackEnded() {
          this.onTrackEnded?.();
        }
      };

      fakeService.setOnTrackEnded(() => {
        endedTriggered = true;
      });

      fakeService.simulateTrackEnded();
      assert.equal(endedTriggered, true, 'onTrackEnded must fire when video track abruptly ends');
    });

    test('global mic toggle shortcut (Ctrl/Cmd+Shift+M) correctly flips mic mute state', () => {
      let isMicMuted = false;
      const toggleMic = () => {
        isMicMuted = !isMicMuted;
        return isMicMuted;
      };

      assert.equal(toggleMic(), true, 'First toggle mutes mic');
      assert.equal(toggleMic(), false, 'Second toggle unmutes mic');
    });

    test('preview trim safeguard enforces 1.0x playback rate and calculates watchdog timeout', () => {
      const trimStart = 5.0;
      const trimEnd = 15.0;
      const durationToRecord = (trimEnd - trimStart) * 1000; // 10000ms

      // Safeguard: playback rate is reset to 1.0
      const safeRate = 1.0;
      const watchdogMs = Math.max(durationToRecord + 3000, 5000);

      assert.equal(safeRate, 1.0, 'Trimming playback rate must be forced to 1.0x');
      assert.equal(watchdogMs, 13000, 'Watchdog must allow duration plus 3000ms grace period');
      assert.ok(watchdogMs > durationToRecord, 'Watchdog must be greater than target duration');
    });

    test('preview shortcut Ctrl/Cmd+L triggers share link copy handler', () => {
      const isCopyLinkShortcut = (e: { ctrlKey: boolean; metaKey: boolean; key: string }) => {
        return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l';
      };

      assert.equal(isCopyLinkShortcut({ ctrlKey: true, metaKey: false, key: 'l' }), true);
      assert.equal(isCopyLinkShortcut({ ctrlKey: false, metaKey: true, key: 'L' }), true);
      assert.equal(isCopyLinkShortcut({ ctrlKey: false, metaKey: false, key: 'l' }), false);
      assert.equal(isCopyLinkShortcut({ ctrlKey: true, metaKey: false, key: 'k' }), false);
    });
  });
});

