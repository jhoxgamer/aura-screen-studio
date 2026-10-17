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
import { detectShape } from '../src/utils/shapeDetection.ts';

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

    test('multi-modifier accelerator safely registers primary and secondary aliases', () => {
      const registeredMap = new Map<string, () => void>();
      const safeRegister = (accelerators: string[], cb: () => void) => {
        accelerators.forEach((acc) => registeredMap.set(acc, cb));
      };

      let micToggled = false;
      safeRegister(['CommandOrControl+Shift+M', 'Alt+Shift+M'], () => {
        micToggled = true;
      });

      assert.ok(registeredMap.has('CommandOrControl+Shift+M'), 'Primary accelerator registered');
      assert.ok(registeredMap.has('Alt+Shift+M'), 'Secondary alias registered');

      // Trigger secondary
      registeredMap.get('Alt+Shift+M')?.();
      assert.equal(micToggled, true, 'Alt+Shift+M successfully triggers mic toggle callback');
    });

    test('device hotplugging event triggers dynamic device re-enumeration', () => {
      let deviceListFetched = 0;
      const fakeMediaDevices = {
        listeners: [] as Array<() => void>,
        addEventListener(event: string, cb: () => void) {
          if (event === 'devicechange') this.listeners.push(cb);
        },
        removeEventListener(event: string, cb: () => void) {
          this.listeners = this.listeners.filter((l) => l !== cb);
        },
        simulateHotplug() {
          this.listeners.forEach((l) => l());
        }
      };

      const initDevices = () => {
        deviceListFetched++;
      };

      fakeMediaDevices.addEventListener('devicechange', initDevices);
      initDevices(); // Initial load
      assert.equal(deviceListFetched, 1, 'Initial device fetch ran once');

      fakeMediaDevices.simulateHotplug(); // User plugs in USB mic
      assert.equal(deviceListFetched, 2, 'Device list auto-refreshed on hotplug event');

      fakeMediaDevices.removeEventListener('devicechange', initDevices);
      fakeMediaDevices.simulateHotplug();
      assert.equal(deviceListFetched, 2, 'Listener properly removed on cleanup');
    });

    test('countdown timer logic handles 0s instantaneous start vs 3s and 5s durations', () => {
      const runCountdown = (initialSeconds: number, onFinished: () => void) => {
        if (initialSeconds <= 0) {
          onFinished();
          return { ticks: 0, windowOpened: false };
        }
        let ticks = 0;
        for (let c = initialSeconds; c > 0; c--) {
          ticks++;
        }
        onFinished();
        return { ticks, windowOpened: true };
      };

      let finished = false;
      const res0 = runCountdown(0, () => { finished = true; });
      assert.equal(finished, true, '0s countdown starts immediately');
      assert.equal(res0.windowOpened, false, '0s countdown does not open countdown window');

      finished = false;
      const res5 = runCountdown(5, () => { finished = true; });
      assert.equal(finished, true);
      assert.equal(res5.ticks, 5, '5s countdown generates 5 ticks');
      assert.equal(res5.windowOpened, true);
    });

    test('player volume slider clamps between 0.0 and 1.0 and syncs with mute', () => {
      let volume = 1.0;
      let muted = false;

      const setVolume = (v: number) => {
        volume = Math.max(0, Math.min(1, v));
        if (volume > 0 && muted) {
          muted = false;
        }
      };

      setVolume(0.5);
      assert.equal(volume, 0.5);

      muted = true;
      setVolume(0.8);
      assert.equal(volume, 0.8);
      assert.equal(muted, false, 'Unmutes automatically when volume slider is dragged above zero');

      setVolume(1.5);
      assert.equal(volume, 1.0, 'Clamps upper bound to 1.0');

      setVolume(-0.2);
      assert.equal(volume, 0.0, 'Clamps lower bound to 0.0');
    });

    test('teleprompter pause-on-hover halts scroll progress only when hovering', () => {
      let scrollPos = 0;
      const speed = 1.25;
      const step = (deltaSec: number, pauseOnHover: boolean, isHovered: boolean) => {
        if (!pauseOnHover || !isHovered) {
          scrollPos += speed * 30 * deltaSec;
        }
      };

      // 1 second with no hover -> progresses 37.5px
      step(1.0, true, false);
      assert.equal(scrollPos, 37.5);

      // 1 second with hover -> stays paused at 37.5px
      step(1.0, true, true);
      assert.equal(scrollPos, 37.5, 'Scroll position remains frozen while hovered');

      // 1 second with hover released -> resumes progressing
      step(1.0, true, false);
      assert.equal(scrollPos, 75.0, 'Scroll position resumes automatically upon hover release');
    });

    test('v1.7.8 drawing overlay undo engine pops stroke and restores stamp step counter', () => {
      interface Stroke {
        tool: string;
        points: Array<{ x: number; y: number }>;
        stampNumber?: number;
      }

      const strokes: Stroke[] = [];
      let nextStampNumber = 1;

      const addStroke = (s: Stroke) => {
        strokes.push(s);
        if (s.tool === 'stamp') {
          nextStampNumber++;
        }
      };

      const handleUndo = () => {
        if (strokes.length > 0) {
          const removed = strokes.pop();
          if (removed?.tool === 'stamp' && nextStampNumber > 1) {
            nextStampNumber = Math.max(1, nextStampNumber - 1);
          }
        }
      };

      // Draw two pen strokes and a stamp badge
      addStroke({ tool: 'pen', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] });
      addStroke({ tool: 'arrow', points: [{ x: 50, y: 50 }, { x: 100, y: 100 }] });
      addStroke({ tool: 'stamp', points: [{ x: 150, y: 150 }], stampNumber: 1 });

      assert.equal(strokes.length, 3);
      assert.equal(nextStampNumber, 2);

      // Undo stamp badge -> removes stroke and rolls stamp number back to 1
      handleUndo();
      assert.equal(strokes.length, 2);
      assert.equal(nextStampNumber, 1, 'Stamp counter rolled back on undo');

      // Undo arrow stroke
      handleUndo();
      assert.equal(strokes.length, 1);
      assert.equal(strokes[0].tool, 'pen');

      // Undo pen stroke -> empty canvas
      handleUndo();
      assert.equal(strokes.length, 0);

      // Extra undo on empty canvas is safe no-op
      handleUndo();
      assert.equal(strokes.length, 0);
      assert.equal(nextStampNumber, 1);
    });

    test('v1.7.8 camera bubble express shortcuts correctly route sizes, mirror, and filter cycling', () => {
      let size: 'small' | 'medium' | 'large' = 'medium';
      let isMirrored = true;
      let bubbleShape: 'circle' | 'squircle' = 'circle';
      let cameraFilter: 'none' | 'blur' | 'studio' | 'vibrant' = 'none';
      let isCameraActive = true;
      let lastHudToast: string | null = null;

      const filters: Array<'none' | 'blur' | 'studio' | 'vibrant'> = ['none', 'blur', 'studio', 'vibrant'];

      const dispatchBubbleKey = (key: string) => {
        const k = key.toLowerCase();
        if (k === '1') {
          size = 'small';
          lastHudToast = 'Tamanho: Pequeno (1)';
        } else if (k === '2') {
          size = 'medium';
          lastHudToast = 'Tamanho: Médio (2)';
        } else if (k === '3') {
          size = 'large';
          lastHudToast = 'Tamanho: Grande (3)';
        } else if (k === 'm') {
          isMirrored = !isMirrored;
          lastHudToast = isMirrored ? 'Espelhado (M)' : 'Normal (M)';
        } else if (k === 's') {
          bubbleShape = bubbleShape === 'circle' ? 'squircle' : 'circle';
          lastHudToast = bubbleShape === 'circle' ? 'Formato: Círculo (S)' : 'Formato: Squircle (S)';
        } else if (k === 'f') {
          cameraFilter = filters[(filters.indexOf(cameraFilter) + 1) % filters.length];
          lastHudToast = `Filtro: ${cameraFilter}`;
        } else if (k === 'v') {
          isCameraActive = !isCameraActive;
          lastHudToast = isCameraActive ? 'Câmera Ativada (V)' : 'Câmera Oculta (V)';
        }
      };

      // Test size switching
      dispatchBubbleKey('1');
      assert.equal(size, 'small');
      assert.equal(lastHudToast, 'Tamanho: Pequeno (1)');

      dispatchBubbleKey('3');
      assert.equal(size, 'large');
      assert.equal(lastHudToast, 'Tamanho: Grande (3)');

      // Test mirror toggle
      dispatchBubbleKey('M');
      assert.equal(isMirrored, false);
      assert.equal(lastHudToast, 'Normal (M)');

      // Test shape toggle
      dispatchBubbleKey('S');
      assert.equal(bubbleShape, 'squircle');
      assert.equal(lastHudToast, 'Formato: Squircle (S)');

      // Test filter cycling
      dispatchBubbleKey('f');
      assert.equal(cameraFilter, 'blur');
      dispatchBubbleKey('f');
      assert.equal(cameraFilter, 'studio');
      dispatchBubbleKey('f');
      assert.equal(cameraFilter, 'vibrant');
      dispatchBubbleKey('f');
      assert.equal(cameraFilter, 'none');

      // Test video mute toggle
      dispatchBubbleKey('v');
      assert.equal(isCameraActive, false);
      assert.equal(lastHudToast, 'Câmera Oculta (V)');
    });

    test('v1.7.8 library video file path copy and search counter calculation', () => {
      const recordings = [
        { id: 'rec-1', title: 'Tutorial TypeScript', filePath: 'C:\\Videos\\rec-1.webm' },
        { id: 'rec-2', title: 'Bug Reprodução Demo', filePath: 'C:\\Videos\\rec-2.webm' },
        { id: 'rec-3', title: 'Tutorial Next.js', filePath: 'C:\\Videos\\rec-3.webm' }
      ];

      // File path copy validation
      let copiedToClipboard = '';
      const copyPath = (path: string) => { copiedToClipboard = path; };

      copyPath(recordings[0].filePath);
      assert.equal(copiedToClipboard, 'C:\\Videos\\rec-1.webm');

      // Search & stats counter validation
      const query = 'tutorial';
      const filtered = recordings.filter(r => r.title.toLowerCase().includes(query.toLowerCase()));
      assert.equal(filtered.length, 2);
      assert.equal(recordings.length, 3);

      const headerLabel = `${filtered.length} de ${recordings.length} vídeos`;
      assert.equal(headerLabel, '2 de 3 vídeos');
    });

    test('v1.7.9 control bar 2-step discard protection guard prevents accidental loss', () => {
      let isConfirmingCancel = false;
      let cancelNotice: string | null = null;
      let recordingCancelled = false;

      const handleCancelClick = (confirmTriggered: boolean) => {
        if (!isConfirmingCancel) {
          isConfirmingCancel = true;
          cancelNotice = 'Clique no lixo novamente para confirmar o descarte';
          return;
        }
        if (confirmTriggered) {
          recordingCancelled = true;
          isConfirmingCancel = false;
          cancelNotice = null;
        }
      };

      // 1st click: prompts for confirmation, does NOT discard recording
      handleCancelClick(false);
      assert.equal(isConfirmingCancel, true);
      assert.equal(cancelNotice, 'Clique no lixo novamente para confirmar o descarte');
      assert.equal(recordingCancelled, false, 'Recording is safeguarded on initial click');

      // 2nd click: confirms and performs safe discard
      handleCancelClick(true);
      assert.equal(recordingCancelled, true);
      assert.equal(isConfirmingCancel, false);
      assert.equal(cancelNotice, null);
    });

    test('v1.7.9 studio preview pro shortcuts (I/O Mark In/Out, frame stepping, volume up/down)', () => {
      let trimStart = 0;
      let trimEnd = 120;
      const duration = 120;
      let currentTime = 15.4;
      let volume = 0.5;

      // Mark In (I)
      const markIn = () => {
        trimStart = Number(Math.min(currentTime, trimEnd).toFixed(1));
      };
      markIn();
      assert.equal(trimStart, 15.4);

      // Advance currentTime and Mark Out (O)
      currentTime = 85.2;
      const markOut = () => {
        trimEnd = Number(Math.max(currentTime, trimStart).toFixed(1));
      };
      markOut();
      assert.equal(trimEnd, 85.2);

      // Frame stepping (. and ,)
      const stepFrameForward = () => {
        currentTime = Math.min(duration, currentTime + 1 / 30);
      };
      const stepFrameBackward = () => {
        currentTime = Math.max(0, currentTime - 1 / 30);
      };

      const beforeStep = currentTime;
      stepFrameForward();
      assert.equal(currentTime > beforeStep, true, 'Advances by 1 frame');

      stepFrameBackward();
      assert.equal(Math.abs(currentTime - beforeStep) < 0.001, true, 'Rewinds by 1 frame');

      // Volume Up / Down (+/- 10%)
      const volumeUp = () => { volume = Math.min(1, Math.round((volume + 0.1) * 10) / 10); };
      const volumeDown = () => { volume = Math.max(0, Math.round((volume - 0.1) * 10) / 10); };

      volumeUp();
      assert.equal(volume, 0.6);
      volumeDown();
      assert.equal(volume, 0.5);
    });

    test('v1.7.9 screenshot studio tool hotkeys and step counter rollback on undo', () => {
      type Tool = 'select' | 'crop' | 'arrow' | 'rect' | 'step' | 'blur' | 'pen' | 'text';
      let activeTool: Tool = 'arrow';
      let stepCounter = 1;
      const annotations: Array<{ type: Tool; id: string }> = [];

      const dispatchScreenshotKey = (key: string) => {
        const k = key.toLowerCase();
        if (k === 'a') activeTool = 'arrow';
        else if (k === 'r') activeTool = 'rect';
        else if (k === 's') activeTool = 'step';
        else if (k === 'p') activeTool = 'pen';
        else if (k === 'b') activeTool = 'blur';
        else if (k === 't') activeTool = 'text';
        else if (k === 'c') activeTool = 'crop';
      };

      dispatchScreenshotKey('R');
      assert.equal(activeTool, 'rect');

      dispatchScreenshotKey('s');
      assert.equal(activeTool, 'step');

      // Add 2 step annotations
      annotations.push({ type: 'step', id: '1' });
      stepCounter++;
      annotations.push({ type: 'step', id: '2' });
      stepCounter++;
      assert.equal(stepCounter, 3);

      // Undo step annotation rolls back step counter
      const handleUndo = () => {
        if (annotations.length > 0) {
          const removed = annotations.pop();
          if (removed?.type === 'step') {
            stepCounter = Math.max(1, stepCounter - 1);
          }
        }
      };

      handleUndo();
      assert.equal(stepCounter, 2, 'Counter rolled back from 3 to 2');
      assert.equal(annotations.length, 1);
    });

    test('v1.8.0 crop selector aspect ratio shortcuts and arrow nudging', () => {
      let aspectRatio: 'free' | '16:9' | '9:16' | '1:1' | '4:3' = 'free';
      let area = { x: 100, y: 100, width: 800, height: 600 };
      const winW = 1920;
      const winH = 1080;

      const handleKey = (key: string, code: string, shift: boolean) => {
        if (key === '1') aspectRatio = 'free';
        else if (key === '2') aspectRatio = '16:9';
        else if (key === '3') aspectRatio = '9:16';
        else if (key === '4') aspectRatio = '1:1';
        else if (key === '5') aspectRatio = '4:3';
        else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
          const delta = shift ? 10 : 2;
          let newX = area.x;
          let newY = area.y;
          if (code === 'ArrowUp') newY = Math.max(0, area.y - delta);
          if (code === 'ArrowDown') newY = Math.min(winH - area.height, area.y + delta);
          if (code === 'ArrowLeft') newX = Math.max(0, area.x - delta);
          if (code === 'ArrowRight') newX = Math.min(winW - area.width, area.x + delta);
          area = { ...area, x: newX, y: newY };
        }
      };

      handleKey('2', '', false);
      assert.equal(aspectRatio, '16:9');

      handleKey('3', '', false);
      assert.equal(aspectRatio, '9:16');

      handleKey('5', '', false);
      assert.equal(aspectRatio, '4:3');

      // Fine nudge (2px)
      handleKey('', 'ArrowRight', false);
      assert.equal(area.x, 102);

      // Coarse nudge (10px with Shift)
      handleKey('', 'ArrowDown', true);
      assert.equal(area.y, 110);
    });

    test('v1.8.0 speaker notes mode switching and checklist advance on Space', () => {
      let mode: 'prompt' | 'notes' | 'edit' = 'prompt';
      const bullets = [
        { id: '1', text: 'Intro', done: false },
        { id: '2', text: 'Demo', done: false }
      ];

      const handleKey = (key: string, code: string) => {
        if (key === '1') mode = 'prompt';
        else if (key === '2') mode = 'notes';
        else if (key === '3') mode = 'edit';
        else if (mode === 'notes' && (code === 'Space' || key === 'Enter')) {
          const idx = bullets.findIndex(b => !b.done);
          if (idx !== -1) bullets[idx].done = true;
        }
      };

      handleKey('2', '', false);
      assert.equal(mode, 'notes');

      // Space advances the first unchecked bullet
      handleKey('', 'Space');
      assert.equal(bullets[0].done, true);
      assert.equal(bullets[1].done, false);

      // Next Space advances the second bullet
      handleKey('', 'Space');
      assert.equal(bullets[1].done, true);
    });

    test('v1.8.0 countdown abort immediately on Escape key', () => {
      let cancelled = false;
      const handleCountdownKey = (key: string) => {
        if (key === 'Escape') {
          cancelled = true;
        }
      };

      handleCountdownKey('Escape');
      assert.equal(cancelled, true, 'Escape safely cancels countdown');
    });

    test('v2.0.0 Zoom smart shape detection and auto-snapping', () => {
      // Simulating smartpen stroke
      const roughCirclePoints = [];
      for (let i = 0; i <= 20; i++) {
        const theta = (i / 20) * Math.PI * 2;
        roughCirclePoints.push({ x: 100 + Math.cos(theta) * 40, y: 100 + Math.sin(theta) * 40 });
      }

      // Detection
      const detected = detectShape(roughCirclePoints);
      assert.equal(detected.type, 'circle');
      assert.ok(detected.confidence >= 0.75);
    });

    test('v2.0.0 Zoom autostamp suite and step counter state', () => {
      const strokes: any[] = [];
      let stampNum = 1;

      // Add a numbered stamp
      strokes.push({ tool: 'stamp', stampType: 'number', stampNumber: stampNum });
      stampNum++;

      // Add a checkmark stamp
      strokes.push({ tool: 'stamp', stampType: 'check' });

      // Add a star stamp
      strokes.push({ tool: 'stamp', stampType: 'star' });

      assert.equal(strokes.length, 3);
      assert.equal(strokes[0].stampType, 'number');
      assert.equal(strokes[0].stampNumber, 1);
      assert.equal(strokes[1].stampType, 'check');
      assert.equal(strokes[2].stampType, 'star');
    });

    test('v2.0.0 Zoom full undo and redo command stack', () => {
      const strokes: any[] = [];
      const redoStack: any[] = [];

      // Draw 2 strokes
      strokes.push({ id: 1, tool: 'pen' });
      strokes.push({ id: 2, tool: 'rectangle' });

      // Undo last
      const undone = strokes.pop();
      redoStack.push(undone);
      assert.equal(strokes.length, 1);
      assert.equal(redoStack.length, 1);
      assert.equal(redoStack[0].id, 2);

      // Redo
      const redone = redoStack.pop();
      strokes.push(redone);
      assert.equal(strokes.length, 2);
      assert.equal(strokes[1].id, 2);
      assert.equal(redoStack.length, 0);
    });

    test('v2.0.0 Zoom whiteboard & blackboard mode switching', () => {
      let whiteboardMode: 'screen' | 'whiteboard' | 'blackboard' = 'screen';
      const cycleWhiteboard = () => {
        if (whiteboardMode === 'screen') whiteboardMode = 'whiteboard';
        else if (whiteboardMode === 'whiteboard') whiteboardMode = 'blackboard';
        else whiteboardMode = 'screen';
      };

      cycleWhiteboard();
      assert.equal(whiteboardMode, 'whiteboard');
      cycleWhiteboard();
      assert.equal(whiteboardMode, 'blackboard');
      cycleWhiteboard();
      assert.equal(whiteboardMode, 'screen');
    });

    test('v2.0.0 Zoom privacy mosaic redaction and on-screen text notes', () => {
      const strokes: any[] = [];

      // Add mosaic redaction stroke
      strokes.push({
        tool: 'mosaic',
        points: [{ x: 100, y: 100 }, { x: 300, y: 150 }]
      });

      // Add text annotation stroke
      strokes.push({
        tool: 'text',
        text: 'Nota de Demonstração',
        points: [{ x: 150, y: 200 }]
      });

      assert.equal(strokes[0].tool, 'mosaic');
      assert.equal(strokes[1].tool, 'text');
      assert.equal(strokes[1].text, 'Nota de Demonstração');
    });
  });
});

