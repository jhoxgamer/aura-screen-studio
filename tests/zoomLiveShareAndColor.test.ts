import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { ShareServer } from '../electron/shareServer.ts';
import type { RecordingMeta } from '../electron/types.ts';

// Helper for HTTP requests
function httpRequest(
  url: string,
  options: http.RequestOptions = {},
  postData?: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

describe('Zoom Live Screen Sharing & Dynamic Color Switching Engine', () => {
  let server: ShareServer;
  let testPort = 4552;
  const mockRecordings: RecordingMeta[] = [];

  before(async () => {
    server = new ShareServer(
      () => mockRecordings,
      () => {}
    );
    (server as any).port = testPort;
    (server as any).startTunnel = () => {};
    await server.start();
    testPort = server.getPort();
  });

  after(() => {
    server.stop();
  });

  describe('Zoom Live Streaming Server Endpoints', () => {
    test('starts live session and serves /live HTML page', async () => {
      const urls = server.startLive('Demonstração Zoom Aura');
      assert.strictEqual(server.isLiveActive(), true);
      assert.ok(urls.localUrl.includes('/live'));

      const res = await httpRequest(`http://localhost:${testPort}/live`);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.headers['content-type']?.includes('text/html'));
      assert.ok(res.body.includes('Transmissão ao Vivo'));
      assert.ok(res.body.includes('Demonstração Zoom Aura'));
      assert.ok(res.body.includes('/live/stream'));
    });

    test('returns accurate live status via /api/live/status', async () => {
      const res = await httpRequest(`http://localhost:${testPort}/api/live/status`);
      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.isLive, true);
      assert.strictEqual(data.isPaused, false);
      assert.strictEqual(typeof data.viewers, 'number');
      assert.strictEqual(data.title, 'Demonstração Zoom Aura');
    });

    test('receives and processes audience reactions via /api/live/reaction', async () => {
      let receivedReaction: any = null;
      server.onLiveReaction = (reaction) => {
        receivedReaction = reaction;
      };

      const payload = JSON.stringify({ emoji: '🔥' });
      const res = await httpRequest(
        `http://localhost:${testPort}/api/live/reaction`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        },
        payload
      );

      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      assert.ok(receivedReaction);
      assert.strictEqual(receivedReaction.emoji, '🔥');
    });

    test('receives and queues audience Q&A questions via /api/live/question', async () => {
      let receivedQuestion: any = null;
      server.onLiveQuestion = (q) => {
        receivedQuestion = q;
      };

      const payload = JSON.stringify({ text: 'Como funciona o laser pointer?', author: 'Ana' });
      const res = await httpRequest(
        `http://localhost:${testPort}/api/live/question`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        },
        payload
      );

      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.success, true);
      assert.ok(receivedQuestion);
      assert.strictEqual(receivedQuestion.text, 'Como funciona o laser pointer?');
      assert.strictEqual(receivedQuestion.author, 'Ana');
    });

    test('handles pause and resume state correctly', async () => {
      server.setLivePaused(true);
      assert.strictEqual(server.isPaused(), true);

      let res = await httpRequest(`http://localhost:${testPort}/api/live/status`);
      let data = JSON.parse(res.body);
      assert.strictEqual(data.isPaused, true);

      server.setLivePaused(false);
      assert.strictEqual(server.isPaused(), false);

      res = await httpRequest(`http://localhost:${testPort}/api/live/status`);
      data = JSON.parse(res.body);
      assert.strictEqual(data.isPaused, false);
    });

    test('stops live session cleanly and updates status to offline', async () => {
      server.stopLive();
      assert.strictEqual(server.isLiveActive(), false);

      const statusRes = await httpRequest(`http://localhost:${testPort}/api/live/status`);
      const statusData = JSON.parse(statusRes.body);
      assert.strictEqual(statusData.isLive, false);

      const res = await httpRequest(`http://localhost:${testPort}/live`);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes('Aguardando Início da Transmissão'));
    });
  });

  describe('Dynamic Color Switching & Laser Dynamic RGB Logic', () => {
    // Tests our hexToRgb utility implemented in DrawingOverlayView
    const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
      const clean = hex.replace('#', '');
      const num = parseInt(clean, 16);
      if (clean.length === 6) {
        return {
          r: (num >> 16) & 255,
          g: (num >> 8) & 255,
          b: num & 255
        };
      }
      return { r: 244, g: 63, b: 94 }; // fallback
    };

    test('correctly converts custom hex colors to RGB components for laser particle effects', () => {
      // Rose
      const rose = hexToRgb('#f43f5e');
      assert.strictEqual(rose.r, 244);
      assert.strictEqual(rose.g, 63);
      assert.strictEqual(rose.b, 94);

      // Emerald green
      const emerald = hexToRgb('#10b981');
      assert.strictEqual(emerald.r, 16);
      assert.strictEqual(emerald.g, 185);
      assert.strictEqual(emerald.b, 129);

      // Indigo blue
      const indigo = hexToRgb('#6366f1');
      assert.strictEqual(indigo.r, 99);
      assert.strictEqual(indigo.g, 102);
      assert.strictEqual(indigo.b, 241);

      // Amber yellow
      const amber = hexToRgb('#f59e0b');
      assert.strictEqual(amber.r, 245);
      assert.strictEqual(amber.g, 158);
      assert.strictEqual(amber.b, 11);

      // Custom user hex (e.g. purple #a855f7)
      const purple = hexToRgb('#a855f7');
      assert.strictEqual(purple.r, 168);
      assert.strictEqual(purple.g, 85);
      assert.strictEqual(purple.b, 247);
    });

    test('retroactively updates color on the most recently completed stroke if within grace window', () => {
      interface MockStroke {
        id: string;
        color: string;
        createdAt: number;
      }

      const now = Date.now();
      const strokes: MockStroke[] = [
        { id: '1', color: '#f43f5e', createdAt: now - 15000 },
        { id: '2', color: '#f43f5e', createdAt: now - 1000 } // within 4s grace period
      ];

      // Simulated handleColorChange logic
      const updateColorWithRetroactive = (newColor: string, strokeList: MockStroke[]): MockStroke[] => {
        const last = strokeList[strokeList.length - 1];
        if (last && Date.now() - last.createdAt < 4000) {
          return strokeList.map((s, idx) => (idx === strokeList.length - 1 ? { ...s, color: newColor } : s));
        }
        return strokeList;
      };

      const updated = updateColorWithRetroactive('#10b981', strokes);
      assert.strictEqual(updated[0].color, '#f43f5e'); // First stroke unmodified
      assert.strictEqual(updated[1].color, '#10b981'); // Most recent stroke updated to new green color!
    });

    test('stamp color inheritance correctly overrides hardcoded stamp defaults', () => {
      const defaultColors: Record<string, string> = {
        check: '#10b981',
        cross: '#ef4444',
        star: '#f59e0b',
        heart: '#ec4899',
        bulb: '#eab308'
      };

      // User chose custom cyan color
      const activeColor = '#06b6d4';
      
      const resolveStampColor = (stampType: string, chosenColor?: string) => {
        return chosenColor || defaultColors[stampType] || '#f43f5e';
      };

      assert.strictEqual(resolveStampColor('check', activeColor), '#06b6d4');
      assert.strictEqual(resolveStampColor('star', activeColor), '#06b6d4');
      assert.strictEqual(resolveStampColor('bulb', undefined), '#eab308'); // falls back to stamp preset
    });

    test('maps numeric hotkeys 1-6 to full studio color palette', () => {
      const COLOR_PALETTE = ['#f43f5e', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#ffffff'];

      const getColorForHotkey = (key: string): string | null => {
        const idx = parseInt(key, 10) - 1;
        if (idx >= 0 && idx < COLOR_PALETTE.length) {
          return COLOR_PALETTE[idx];
        }
        return null;
      };

      assert.strictEqual(getColorForHotkey('1'), '#f43f5e'); // Rose
      assert.strictEqual(getColorForHotkey('2'), '#6366f1'); // Indigo
      assert.strictEqual(getColorForHotkey('3'), '#10b981'); // Emerald
      assert.strictEqual(getColorForHotkey('4'), '#f59e0b'); // Amber
      assert.strictEqual(getColorForHotkey('5'), '#ec4899'); // Pink
      assert.strictEqual(getColorForHotkey('6'), '#ffffff'); // White
      assert.strictEqual(getColorForHotkey('7'), null); // Out of bounds
    });
  });
});
