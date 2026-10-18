/**
 * run-soak-test.cjs
 *
 * INSTRUMENTED HARNESS FOR LONG-DURATION SOAK TESTING (15m, 30m, 60m)
 *
 * Designed to execute uninterrupted real-wall-clock soak sessions when bench time is available.
 *
 * Features:
 * - Prevents OS suspension via electron.powerSaveBlocker ('prevent-app-suspension').
 * - Streams live WebM (VP8 + Opus) from Host BrowserWindow via MediaRecorder.
 * - Spectator BrowserWindow renders stream via MSE (WebSocket -> MediaSource).
 * - Tracks requestVideoFrameCallback, presentationTime, inter-frame intervals, and stalls.
 * - Samples OS Process Metrics (Working Set, Private Bytes, CPU) via app.getAppMetrics() every 30s.
 * - Records continuous buffer ranges (buffered.end - currentTime).
 * - Generates structured JSON report in tests/poc/soak-test-<duration>s-results.json.
 *
 * Usage:
 *   electron scripts/run-soak-test.cjs --duration=900   (15 minutes)
 *   electron scripts/run-soak-test.cjs --duration=1800  (30 minutes)
 *   electron scripts/run-soak-test.cjs --duration=3600  (60 minutes)
 *   electron scripts/run-soak-test.cjs --duration=10    (10-second dry run verification)
 */

const { app, BrowserWindow, ipcMain, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');

// Disable background throttling so hidden/offscreen windows execute at full rate
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');

const { ShareServer } = require('../dist-electron/shareServer.js');

// Parse duration argument
let targetDurationSec = 900; // default: 15 minutes
for (const arg of process.argv) {
  if (arg.startsWith('--duration=')) {
    const val = parseInt(arg.split('=')[1], 10);
    if (!isNaN(val) && val > 0) {
      targetDurationSec = val;
    }
  }
}

const TEST_PORT = 4598;
const targetDurationMs = targetDurationSec * 1000;

console.log('========================================================================');
console.log(`⏱️ INICIANDO SOAK TEST DO LIVE SHARE MSE (DURAÇÃO ALVO: ${targetDurationSec}s / ${(targetDurationSec / 60).toFixed(1)} min)`);
console.log('========================================================================\n');

app.whenReady().then(async () => {
  // Prevent OS sleep / screen saver suspension during soak test
  const powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  console.log(`[SOAK] Bloqueador de suspensão do SO ativado (ID: ${powerBlockerId}, ativo: ${powerSaveBlocker.isStarted(powerBlockerId)})`);

  let server = null;
  let hostWin = null;
  let spectatorWin = null;

  const soakReport = {
    timestamp: new Date().toISOString(),
    config: {
      targetDurationSec,
      targetDurationMs,
      port: TEST_PORT,
      fps: 30,
      codecs: 'video/webm; codecs=vp8,opus'
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    },
    memorySamples: [],
    playbackMetrics: null,
    summary: null
  };

  try {
    // 1. Initialize ShareServer in MSE mode
    server = new ShareServer(() => [], () => {});
    server.port = TEST_PORT;
    server.startTunnel = () => {};
    await server.start();
    server.startLive('Aura Soak Test Session');
    server.setLiveTransportMode('mse');
    console.log(`[SOAK] ShareServer iniciado em http://localhost:${TEST_PORT}/live (Modo: MSE)`);

    ipcMain.on('live:push-chunk', (_, arrayBuffer) => {
      const buf = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
      server.broadcastLiveMseChunk(buf);
    });

    // 2. Launch Host Window (MediaRecorder generating synthetic WebM stream)
    hostWin = new BrowserWindow({
      width: 480,
      height: 360,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false
      }
    });

    const hostHtml = `
      <!DOCTYPE html>
      <html>
      <body>
        <canvas id="c" width="320" height="240"></canvas>
        <script>
          const { ipcRenderer } = require('electron');
          const canvas = document.getElementById('c');
          const ctx = canvas.getContext('2d');
          let frame = 0;
          let nextFrameTime = performance.now();
          const FRAME_INTERVAL = 1000 / 30; // 33.3333ms
          const draw = () => {
            frame++;
            ctx.fillStyle = (frame % 60 < 30) ? '#0284c7' : '#0f172a';
            ctx.fillRect(0, 0, 320, 240);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px monospace';
            ctx.fillText('SOAK FRAME ' + frame, 20, 50);
            ctx.fillText(new Date().toISOString().substring(11, 23), 20, 90);
            ctx.fillRect(20 + (frame % 260), 120, 30, 30);

            nextFrameTime += FRAME_INTERVAL;
            const delay = Math.max(0, nextFrameTime - performance.now());
            setTimeout(draw, delay);
          };
          draw();

          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
          osc.connect(gain);
          const audioDest = audioCtx.createMediaStreamDestination();
          gain.connect(audioDest);
          osc.start();

          const vStream = canvas.captureStream(30);
          const combinedStream = new MediaStream([
            vStream.getVideoTracks()[0],
            audioDest.stream.getAudioTracks()[0]
          ]);

          const recorder = new MediaRecorder(combinedStream, {
            mimeType: 'video/webm; codecs=vp8,opus',
            videoBitsPerSecond: 1500000
          });

          recorder.ondataavailable = async (e) => {
            if (e.data && e.data.size > 0) {
              const buf = await e.data.arrayBuffer();
              ipcRenderer.send('live:push-chunk', buf);
            }
          };
          recorder.start(100);
        </script>
      </body>
      </html>
    `;
    await hostWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(hostHtml));
    console.log('[SOAK] Host MediaRecorder ativo transmitindo a 30 FPS com compensação de deriva...');

    // Wait 1.5s for initial cluster generation
    await new Promise(r => setTimeout(r, 1500));

    // 3. Launch Spectator Window
    spectatorWin = new BrowserWindow({
      width: 640,
      height: 480,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false
      }
    });

    const domReady = new Promise(r => spectatorWin.webContents.once('dom-ready', r));
    spectatorWin.loadURL(`http://localhost:${TEST_PORT}/live`).catch(() => {});
    await domReady;
    spectatorWin.focus();
    console.log('[SOAK] Spectator DOM carregado e focado.');

    // 4. Inject Measurement Instrumentation into Spectator
    await spectatorWin.webContents.executeJavaScript(`
      window.__soakStats = {
        startTime: performance.now(),
        callbacks: 0,
        frameIntervals: [],
        stalls: 0,
        stallDurations: [],
        lastVsyncTime: null,
        initialMetrics: null,
        finalMetrics: null,
        bufferSamples: [],
        reconnects: 0
      };

      const btn = document.getElementById('tabModeMse');
      if (btn) btn.click();
      else if (typeof switchTransport === 'function') switchTransport('mse');

      const video = document.getElementById('liveVideo');
      if (video) {
        video.muted = true;
        video.play().catch(() => {});

        video.addEventListener('waiting', () => {
          window.__soakStats.stalls++;
        });
        video.addEventListener('stalled', () => {
          window.__soakStats.stalls++;
        });

        // Capture snapshot at start of playback
        function recordInitial() {
          const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
          window.__soakStats.initialMetrics = {
            currentTime: video.currentTime,
            totalVideoFrames: q ? q.totalVideoFrames : 0,
            droppedVideoFrames: q ? q.droppedVideoFrames : 0,
            webkitDecodedFrameCount: video.webkitDecodedFrameCount || 0,
            webkitAudioDecodedByteCount: video.webkitAudioDecodedByteCount || 0
          };
        }
        setTimeout(recordInitial, 1500);

        function onVsync(now, metadata) {
          window.__soakStats.callbacks++;
          if (window.__soakStats.lastVsyncTime !== null) {
            const delta = now - window.__soakStats.lastVsyncTime;
            window.__soakStats.frameIntervals.push(delta);
          }
          window.__soakStats.lastVsyncTime = now;

          // Periodic buffer sample (once every ~30 frames = ~1s)
          if (window.__soakStats.callbacks % 30 === 0 && video.buffered.length > 0) {
            const bufEnd = video.buffered.end(video.buffered.length - 1);
            window.__soakStats.bufferSamples.push({
              t: (now - window.__soakStats.startTime) / 1000,
              bufferAhead: bufEnd - video.currentTime,
              currentTime: video.currentTime
            });
          }

          if (video.requestVideoFrameCallback) {
            video.requestVideoFrameCallback(onVsync);
          }
        }

        if (video.requestVideoFrameCallback) {
          video.requestVideoFrameCallback(onVsync);
        }
      }
    `);
    console.log('[SOAK] Spectator instrumentado em modo MSE.');

    // Wait 2s for playback to establish before starting soak measurement
    await new Promise(r => setTimeout(r, 2000));

    // 5. Periodic Memory & Resource Sampling Loop
    const sampleIntervalMs = Math.min(30000, targetDurationMs / 2); // sample every 30s (or more often for dry runs)
    const startTime = Date.now();
    let elapsedMs = 0;

    while (elapsedMs < targetDurationMs) {
      await new Promise(r => setTimeout(r, Math.min(sampleIntervalMs, targetDurationMs - elapsedMs)));
      elapsedMs = Date.now() - startTime;

      // Collect per-process metrics from Electron
      const processMetrics = app.getAppMetrics();
      const nodeMem = process.memoryUsage();

      const sample = {
        elapsedSec: Math.round(elapsedMs / 1000),
        nodeHeapUsedMB: (nodeMem.heapUsed / (1024 * 1024)).toFixed(2),
        nodeHeapTotalMB: (nodeMem.heapTotal / (1024 * 1024)).toFixed(2),
        nodeRssMB: (nodeMem.rss / (1024 * 1024)).toFixed(2),
        processes: processMetrics.map(p => ({
          pid: p.pid,
          type: p.type,
          workingSetMB: (p.memory.workingSetSize / 1024).toFixed(2),
          privateBytesMB: (p.memory.privateBytes / 1024).toFixed(2),
          cpuPercent: p.cpu.percentCPUUsage.toFixed(1)
        }))
      };
      soakReport.memorySamples.push(sample);

      // Query live player metrics
      const playerProbe = await spectatorWin.webContents.executeJavaScript(`
        (() => {
          const video = document.getElementById('liveVideo');
          const q = video && video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
          return {
            callbacks: window.__soakStats ? window.__soakStats.callbacks : 0,
            stalls: window.__soakStats ? window.__soakStats.stalls : 0,
            currentTime: video ? video.currentTime.toFixed(2) : 0,
            totalVideoFrames: q ? q.totalVideoFrames : 0,
            droppedVideoFrames: q ? q.droppedVideoFrames : 0,
            decodedVideoFrames: video ? (video.webkitDecodedFrameCount || 0) : 0
          };
        })()
      `).catch(() => null);

      const mainProc = processMetrics.find(p => p.type === 'Browser') || { memory: { workingSetSize: 0 } };
      const gpuProc = processMetrics.find(p => p.type === 'GPU') || { memory: { workingSetSize: 0 } };
      const renderers = processMetrics.filter(p => p.type === 'Tab');

      const rendererTotalWS = renderers.reduce((acc, r) => acc + (r.memory.workingSetSize / 1024), 0).toFixed(1);
      const mainWS = (mainProc.memory.workingSetSize / 1024).toFixed(1);
      const gpuWS = (gpuProc.memory.workingSetSize / 1024).toFixed(1);

      console.log(`[SOAK] Tempo: ${Math.round(elapsedMs / 1000)}s / ${targetDurationSec}s | rVFC: ${playerProbe?.callbacks || 0} | Stalls: ${playerProbe?.stalls || 0} | Playhead: ${playerProbe?.currentTime || 0}s | WS Main: ${mainWS}MB | Renderers: ${rendererTotalWS}MB | GPU: ${gpuWS}MB`);
    }

    // 6. Capture Final Snapshot and Compile Statistics
    const finalStats = await spectatorWin.webContents.executeJavaScript(`
      (() => {
        const video = document.getElementById('liveVideo');
        const q = video && video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
        window.__soakStats.finalMetrics = {
          currentTime: video ? video.currentTime : 0,
          totalVideoFrames: q ? q.totalVideoFrames : 0,
          droppedVideoFrames: q ? q.droppedVideoFrames : 0,
          corruptedVideoFrames: q ? (q.corruptedVideoFrames || 0) : 0,
          webkitDecodedFrameCount: video ? (video.webkitDecodedFrameCount || 0) : 0,
          webkitAudioDecodedByteCount: video ? (video.webkitAudioDecodedByteCount || 0) : 0
        };

        const intervals = window.__soakStats.frameIntervals;
        intervals.sort((a, b) => a - b);

        const count = intervals.length;
        const sum = intervals.reduce((acc, v) => acc + v, 0);
        const avg = count > 0 ? sum / count : 0;
        const min = count > 0 ? intervals[0] : 0;
        const max = count > 0 ? intervals[count - 1] : 0;

        // Standard deviation (jitter)
        const variance = count > 0 ? intervals.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / count : 0;
        const stdDev = Math.sqrt(variance);

        // Nearest rank percentiles
        function percentile(p) {
          if (count === 0) return 0;
          const rank = Math.ceil((p / 100) * count);
          const index = Math.min(count - 1, Math.max(0, rank - 1));
          return intervals[index];
        }

        return {
          totalCallbacks: window.__soakStats.callbacks,
          stalls: window.__soakStats.stalls,
          initial: window.__soakStats.initialMetrics,
          final: window.__soakStats.finalMetrics,
          bufferSamplesCount: window.__soakStats.bufferSamples.length,
          recentBufferSamples: window.__soakStats.bufferSamples.slice(-10),
          stats: {
            frameCount: count,
            minIntervalMs: min,
            maxIntervalMs: max,
            avgIntervalMs: avg,
            p50Ms: percentile(50),
            p95Ms: percentile(95),
            p99Ms: percentile(99),
            jitterStdDevMs: stdDev,
            effectiveFps: avg > 0 ? (1000 / avg) : 0
          }
        };
      })()
    `);

    const effectiveDurationSec = (Date.now() - startTime) / 1000;
    soakReport.playbackMetrics = finalStats;

    // Memory differential (Initial vs Final)
    const initialSample = soakReport.memorySamples[0];
    const finalSample = soakReport.memorySamples[soakReport.memorySamples.length - 1];

    const initialTotalWS = initialSample ? initialSample.processes.reduce((acc, p) => acc + parseFloat(p.workingSetMB), 0) : 0;
    const finalTotalWS = finalSample ? finalSample.processes.reduce((acc, p) => acc + parseFloat(p.workingSetMB), 0) : 0;
    const deltaTotalWS = (finalTotalWS - initialTotalWS).toFixed(2);

    soakReport.summary = {
      effectiveDurationSec: effectiveDurationSec.toFixed(2),
      targetDurationSec,
      completedWithoutFatalError: true,
      totalFramesPresented: finalStats.totalCallbacks,
      effectiveFps: finalStats.stats.effectiveFps.toFixed(2),
      stallsCount: finalStats.stalls,
      frameIntervalAvgMs: finalStats.stats.avgIntervalMs.toFixed(2),
      frameIntervalP99Ms: finalStats.stats.p99Ms.toFixed(2),
      jitterStdDevMs: finalStats.stats.jitterStdDevMs.toFixed(2),
      memoryDeltaTotalMB: deltaTotalWS,
      memoryFinalTotalMB: finalTotalWS.toFixed(2)
    };

    console.log('\n========================================================================');
    console.log(`✅ SOAK TEST CONCLUÍDO COM SUCESSO: ${effectiveDurationSec.toFixed(1)}s`);
    console.log(`📊 Quadros Apresentados: ${finalStats.totalCallbacks} | FPS Efetivo: ${finalStats.stats.effectiveFps.toFixed(2)}`);
    console.log(`⏱️ Intervalo Médio: ${finalStats.stats.avgIntervalMs.toFixed(2)}ms | p99: ${finalStats.stats.p99Ms.toFixed(2)}ms | Jitter: ${finalStats.stats.jitterStdDevMs.toFixed(2)}ms`);
    console.log(`📉 Stalls (>100ms): ${finalStats.stalls} | Variação de Working Set Total: ${deltaTotalWS} MB`);
    console.log('========================================================================\n');

    // Save report
    const reportPath = path.resolve(__dirname, `../tests/poc/soak-test-${targetDurationSec}s-results.json`);
    fs.writeFileSync(reportPath, JSON.stringify(soakReport, null, 2));
    console.log(`[SOAK] Relatório empírico salvo em: ${reportPath}`);

  } catch (err) {
    console.error('❌ Erro durante o Soak Test:', err);
    process.exit(1);
  } finally {
    if (powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId);
    }
    if (hostWin && !hostWin.isDestroyed()) hostWin.destroy();
    if (spectatorWin && !spectatorWin.isDestroyed()) spectatorWin.destroy();
    if (server) await server.stop();
    app.quit();
  }
});
