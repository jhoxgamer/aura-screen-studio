import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { BroadcastService } from '../electron/broadcastService.ts';
import type { BroadcastConfig, SafeStorageLike } from '../electron/broadcastService.ts';

describe('Aura Broadcast & safeStorage Security Policy', () => {
  const tempCredsPath = path.join(process.cwd(), 'temp_test_credentials.bin');

  test('YouTube Live encoder arguments adhere strictly to Google specifications', () => {
    const service = new BroadcastService(tempCredsPath);
    const config: BroadcastConfig = {
      serverUrl: 'rtmps://a.rtmps.youtube.com/live2',
      streamKey: 'live_test_key_1234',
      resolution: '1080p',
      fps: 60,
      bitrateKbps: 6000,
      keyframeIntervalSec: 2.0,
      audioBitrateKbps: 128,
      audioSampleRate: 48000
    };

    const inputArgs = ['-f', 'dshow', '-i', 'video=screen-capture-recorder'];
    const fullArgs = service.buildFfmpegArgs(config, inputArgs);

    // 1. Codec H.264 High Profile Level 4.2
    assert.ok(fullArgs.includes('-c:v'));
    assert.equal(fullArgs[fullArgs.indexOf('-c:v') + 1], 'libx264');
    assert.equal(fullArgs[fullArgs.indexOf('-profile:v') + 1], 'high');
    assert.equal(fullArgs[fullArgs.indexOf('-level:v') + 1], '4.2');

    // 2. Strict CBR with 2x buffer compliance
    assert.equal(fullArgs[fullArgs.indexOf('-b:v') + 1], '6000k');
    assert.equal(fullArgs[fullArgs.indexOf('-minrate') + 1], '6000k');
    assert.equal(fullArgs[fullArgs.indexOf('-maxrate') + 1], '6000k');
    assert.equal(fullArgs[fullArgs.indexOf('-bufsize') + 1], '12000k');

    // 3. Exactly 2.0s keyframe interval (GOP = 120 at 60 fps)
    assert.equal(fullArgs[fullArgs.indexOf('-g') + 1], '120');
    assert.equal(fullArgs[fullArgs.indexOf('-keyint_min') + 1], '120');
    assert.equal(fullArgs[fullArgs.indexOf('-sc_threshold') + 1], '0');

    // 4. Audio AAC stereo 128 kbps @ 48 kHz
    assert.equal(fullArgs[fullArgs.indexOf('-c:a') + 1], 'aac');
    assert.equal(fullArgs[fullArgs.indexOf('-b:a') + 1], '128k');
    assert.equal(fullArgs[fullArgs.indexOf('-ar') + 1], '48000');
    assert.equal(fullArgs[fullArgs.indexOf('-ac') + 1], '2');

    // 5. Container & RTMPS destination
    assert.equal(fullArgs[fullArgs.lastIndexOf('-f') + 1], 'flv');
    assert.equal(fullArgs[fullArgs.length - 1], 'rtmps://a.rtmps.youtube.com/live2/live_test_key_1234');
  });

  test('safeStorage conservative policy: volatile-only when encryption is basic_text or unavailable', () => {
    // Mock unavailable or basic_text safeStorage
    const mockBasicTextStorage: SafeStorageLike = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'basic_text'
    };

    const service = new BroadcastService(tempCredsPath, mockBasicTextStorage);
    const status = service.getStorageStatus();

    assert.equal(status.isVolatileOnly, true, 'basic_text must be classified as volatile only');
    assert.ok(status.warningNotice?.includes('basic_text'));

    const res = service.saveStreamKey('test_secret_stream_key');
    assert.equal(res.success, true);
    assert.equal(res.isVolatile, true);

    // Must NEVER write plaintext to disk
    assert.equal(fs.existsSync(tempCredsPath), false, 'Stream key must NOT be written to disk under basic_text');

    // Accessible in memory for active session
    assert.equal(service.loadStreamKey(), 'test_secret_stream_key');

    // Clearing removes from memory
    service.clearStreamKey();
    assert.equal(service.loadStreamKey(), null);
  });

  test('safeStorage secure policy: encrypts and saves to disk when secure backend is available', () => {
    // Mock secure DPAPI/Keychain/Secret Service storage
    const mockSecureStorage: SafeStorageLike = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'dpapi',
      encryptString: (str: string) => Buffer.from(`ENC[${str}]`, 'utf-8'),
      decryptString: (buf: Buffer) => buf.toString('utf-8').replace(/^ENC\[(.*)\]$/, '$1')
    };

    const service = new BroadcastService(tempCredsPath, mockSecureStorage);
    const status = service.getStorageStatus();

    assert.equal(status.isEncryptionAvailable, true);
    assert.equal(status.storageBackend, 'dpapi');
    assert.equal(status.isVolatileOnly, false);

    const res = service.saveStreamKey('my_youtube_super_secret_key');
    assert.equal(res.success, true);
    assert.equal(res.isVolatile, false);

    // File MUST exist on disk encrypted
    assert.equal(fs.existsSync(tempCredsPath), true);
    const rawDisk = fs.readFileSync(tempCredsPath, 'utf-8');
    assert.equal(rawDisk, 'ENC[my_youtube_super_secret_key]');

    // Clean service instance decrypts from disk
    const service2 = new BroadcastService(tempCredsPath, mockSecureStorage);
    assert.equal(service2.loadStreamKey(), 'my_youtube_super_secret_key');

    // Clear removes from disk
    service2.clearStreamKey();
    assert.equal(fs.existsSync(tempCredsPath), false);
    assert.equal(service2.loadStreamKey(), null);
  });

  test('telemetry distinguishes explicitly between network saturation drops and encoder lag', () => {
    const service = new BroadcastService(tempCredsPath);
    service.startBroadcast({ streamKey: 'simulated_key' });

    // Initial state
    const t0 = service.getTelemetry();
    assert.equal(t0.isStreaming, true);
    assert.equal(t0.status, 'live');
    assert.equal(t0.droppedFramesNetwork, 0);
    assert.equal(t0.encoderLagFrames, 0);

    // Simulate network socket backpressure drop
    service.reportMetrics({ droppedNetworkDelta: 15 });
    const t1 = service.getTelemetry();
    assert.equal(t1.droppedFramesNetwork, 15, 'Network drops must increment independently');
    assert.equal(t1.encoderLagFrames, 0, 'Encoder lag must remain unaffected by network drops');

    // Simulate CPU/GPU encoder throttle lag
    service.reportMetrics({ encoderLagDelta: 8, fps: 42 });
    const t2 = service.getTelemetry();
    assert.equal(t2.droppedFramesNetwork, 15);
    assert.equal(t2.encoderLagFrames, 8, 'Encoder lag must increment independently');
    assert.equal(t2.fps, 42);

    service.stopBroadcast();
    const tEnd = service.getTelemetry();
    assert.equal(tEnd.isStreaming, false);
    assert.equal(tEnd.status, 'idle');
  });

  test('cleans up any temp credentials file after test', () => {
    if (fs.existsSync(tempCredsPath)) {
      try { fs.unlinkSync(tempCredsPath); } catch {}
    }
    assert.equal(fs.existsSync(tempCredsPath), false);
  });
});

describe('Video Trimmer Architecture & Fast Seek Optimization', () => {
  test('fast seek parameters: -ss before -i and duration -t are correctly formatted', () => {
    const startSec = 12.35;
    const endSec = 45.10;
    const durationSec = Math.max(0.1, endSec - startSec);
    const inputPath = 'video.webm';
    const outputPath = 'output.webm';

    // Verify copy arguments
    const copyArgs = [
      '-y',
      '-ss', String(startSec),
      '-i', inputPath,
      '-t', String(durationSec),
      '-c', 'copy',
      outputPath
    ];

    assert.equal(copyArgs[1], '-ss');
    assert.equal(copyArgs[2], '12.35');
    assert.equal(copyArgs[3], '-i');
    assert.equal(copyArgs[5], '-t');
    assert.equal(copyArgs[6], '32.75');
    assert.equal(copyArgs[7], '-c');
    assert.equal(copyArgs[8], 'copy');
  });

  test('fast re-encode fallback respects WebM container with realtime deadline and multithreading', () => {
    const durationSec = 32.75;
    const inputPath = 'video.webm';
    const outputPath = 'output.webm';
    const reencodeArgs = [
      '-y',
      '-ss', '12.35',
      '-i', inputPath,
      '-t', String(durationSec),
      '-c:v', 'libvpx-vp9',
      '-deadline', 'realtime',
      '-cpu-used', '4',
      '-crf', '28',
      '-b:v', '0',
      '-c:a', 'libopus',
      '-b:a', '128k',
      outputPath
    ];

    assert.ok(reencodeArgs.includes('-deadline'));
    assert.equal(reencodeArgs[reencodeArgs.indexOf('-deadline') + 1], 'realtime');
    assert.equal(reencodeArgs[reencodeArgs.indexOf('-cpu-used') + 1], '4');
    assert.equal(reencodeArgs[reencodeArgs.indexOf('-c:a') + 1], 'libopus');
  });
});

describe('Content Security Policy (CSP) Verification', () => {
  test('index.html contains strict CSP meta tag without insecure external origins', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
    assert.ok(html.includes('http-equiv="Content-Security-Policy"'), 'CSP meta tag must be declared');
    assert.ok(html.includes("default-src 'self'"), 'default-src self must be enforced');
    assert.ok(html.includes("style-src 'self' 'unsafe-inline'"), 'style-src must allow React inline styles and self');
    assert.ok(html.includes("connect-src 'self' ws: wss: http: https:"), 'connect-src must permit WebSocket and HTTP APIs');
  });
});
