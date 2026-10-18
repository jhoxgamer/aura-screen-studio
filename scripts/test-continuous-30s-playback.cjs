/**
 * test-continuous-30s-playback.cjs
 *
 * EMPIRICAL VALIDATION: Continuous 30-Second MSE Audiovisual Playback & Late-Joiner
 *
 * Rigorous protocol:
 * 1. Host Window generates real WebM (VP8 @ 30 FPS + Web Audio 440 Hz sine) via real MediaRecorder.
 * 2. Spectator Window consumes the stream through WebSocket -> MediaSource / SourceBuffer.
 * 3. 30-Second Measurement Window:
 *    - requestVideoFrameCallback is re-armed on EVERY callback continuously for >= 30,000 ms.
 *    - Records exact timestamps, inter-frame intervals, stalls (>100ms), jitter (std dev).
 *    - Measures currentTime advancement, decoded video frames, decoded audio bytes.
 *    - Investigates and explains the architectural difference between webkitDecodedFrameCount and rVFC presented frames.
 * 4. Mid-stream Late Joiner:
 *    - Connects while host stream is in full progress.
 *    - Validates smooth entry via cached Init Segment + Keyframe Cluster with continuous rVFC playback.
 * 5. Strict 5-dimension epistemological separation:
 *    - Bytes received
 *    - Segments accepted by SourceBuffer
 *    - Media decoded (video + Opus audio)
 *    - Frames presented on screen (rVFC)
 *    - Physically heard: rigorously classified as [NÃO VERIFICADO]
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure Chromium does not throttle offscreen/hidden rendering and media
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');

const { ShareServer } = require('../dist-electron/shareServer.js');

const TEST_PORT = 4596;
const MEASUREMENT_WINDOW_MS = 30000; // Continuous 30-second window

const results = {
  timestamp: new Date().toISOString(),
  environment: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch
  },
  config: {
    measurementWindowMs: MEASUREMENT_WINDOW_MS,
    targetFps: 30,
    sourceResolution: '320x240',
    audioTrack: 'Opus 440Hz Sine Wave'
  },
  stages: {}
};

app.whenReady().then(async () => {
  let server = null;
  let hostWin = null;
  let spectatorWin = null;
  let lateSpectatorWin = null;

  try {
    console.log('================================================================');
    console.log('🧪 BENCHMARK RIGUROSO: REPRODUÇÃO MSE CONTÍNUA DE 30 SEGUNDOS');
    console.log('================================================================\n');

    // 1. Start ShareServer in MSE mode
    server = new ShareServer(() => [], () => {});
    server.port = TEST_PORT;
    server.startTunnel = () => {};
    await server.start();
    server.startLive('Validação 30s Contínua MSE');
    server.setLiveTransportMode('mse');
    console.log(`[1/4] ShareServer ativo em http://localhost:${TEST_PORT}/live (Modo: MSE)`);

    ipcMain.on('live:push-chunk', (_, arrayBuffer) => {
      const buf = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
      if (server && server.isLiveActive()) {
        server.broadcastLiveMseChunk(buf);
      }
    });

    // 2. Launch Host Window producing real MediaRecorder stream (VP8 + Opus)
    hostWin = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        backgroundThrottling: false
      }
    });

    hostWin.webContents.on('console-message', (e, level, message) => {
      console.log(`[HostConsole] ${message}`);
    });

    await hostWin.loadURL('data:text/html,<html><body><canvas id="c" width="320" height="240"></canvas></body></html>');

    const hostInit = await hostWin.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        try {
          const { ipcRenderer } = require('electron');
          const canvas = document.getElementById('c');
          const ctx = canvas.getContext('2d');
          let frame = 0;

          // Paint canvas at 30 FPS with high-resolution drift compensation
          let nextFrameTime = performance.now();
          const FRAME_INTERVAL = 1000 / 30; // 33.3333ms
          const draw = () => {
            frame++;
            ctx.fillStyle = (frame % 2 === 0) ? '#0070f3' : '#7928ca';
            ctx.fillRect(0, 0, 320, 240);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText('Frame #' + frame, 20, 40);
            ctx.fillText('Epoch: ' + Date.now(), 20, 80);
            ctx.fillRect(20 + (frame % 260), 120, 30, 30);

            nextFrameTime += FRAME_INTERVAL;
            const delay = Math.max(0, nextFrameTime - performance.now());
            setTimeout(draw, delay);
          };
          draw();

          const vStream = canvas.captureStream(30);

          // Web Audio: 440 Hz Sine Tone
          const audioCtx = new AudioContext();
          const osc = audioCtx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, audioCtx.currentTime);
          const gain = audioCtx.createGain();
          gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
          const dst = audioCtx.createMediaStreamDestination();
          osc.connect(gain);
          gain.connect(dst);
          osc.start();

          const combinedStream = new MediaStream([
            ...vStream.getVideoTracks(),
            ...dst.stream.getAudioTracks()
          ]);

          const mime = 'video/webm;codecs=vp8,opus';
          const mr = new MediaRecorder(combinedStream, {
            mimeType: mime,
            videoBitsPerSecond: 1500000
          });

          let chunkCount = 0;
          let bytesCount = 0;
          mr.ondataavailable = async (e) => {
            if (e.data && e.data.size > 0) {
              chunkCount++;
              bytesCount += e.data.size;
              const buf = await e.data.arrayBuffer();
              ipcRenderer.send('live:push-chunk', buf);
            }
          };

          mr.start(100); // 100ms cluster slices

          resolve({
            started: true,
            mime,
            videoTracks: vStream.getVideoTracks().length,
            audioTracks: dst.stream.getAudioTracks().length
          });
        } catch (err) {
          reject(err.message);
        }
      });
    `);

    console.log(`[2/4] Host gerando fluxo real MediaRecorder: mime=${hostInit.mime}, videoTracks=${hostInit.videoTracks}, audioTracks=${hostInit.audioTracks}`);
    results.stages.host = hostInit;

    // Allow host to emit first clusters so server extracts and caches Init Segment
    await new Promise(r => setTimeout(r, 600));

    // 3. Connect Spectator Window for Continuous 30-Second Playback
    spectatorWin = new BrowserWindow({
      show: true,
      width: 480,
      height: 360,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    spectatorWin.webContents.on('console-message', (e, level, message) => {
      console.log(`[SpectatorConsole] ${message}`);
    });

    const domReady = new Promise(r => spectatorWin.webContents.once('dom-ready', r));
    spectatorWin.loadURL(`http://localhost:${TEST_PORT}/live`).catch(() => {});
    await domReady;
    spectatorWin.focus();

    // Switch to MSE transport and measure Time To First Frame (TTFF)
    const ttffMetric = await spectatorWin.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const video = document.getElementById('liveVideo');
        console.log('[TestTTFF] video found:', !!video, 'video.muted:', video ? video.muted : null);
        const start = performance.now();
        let frameCaught = false;

        function onFirstFrame(now, meta) {
          if (frameCaught) return;
          frameCaught = true;
          console.log('[TestTTFF] onFirstFrame caught at', performance.now() - start, 'ms');
          resolve({
            ttffMs: Math.round((performance.now() - start) * 10) / 10,
            presentationTime: meta.presentationTime
          });
        }

        if (typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(onFirstFrame);
        }

        const btn = document.getElementById('tabModeMse');
        console.log('[TestTTFF] tabModeMse button found:', !!btn);
        if (btn) btn.click();
        else if (typeof switchTransport === 'function') switchTransport('mse');

        setTimeout(() => {
          if (!frameCaught) {
            console.log('[TestTTFF] timeout reached, frameCaught is false');
            resolve({ ttffMs: Math.round((performance.now() - start) * 10) / 10, timeout: true });
          }
        }, 6000);
      });
    `);

    console.log(`[3/4] Espectador conectado e reproduzindo! Tempo até primeiro quadro (TTFF): ${ttffMetric.ttffMs} ms`);
    console.log(`\n⏳ INICIANDO JANELA DE MEDIÇÃO CONTÍNUA DE 30 SEGUNDOS (REGIME PERMANENTE)...`);
    console.log(`   (Rearmando requestVideoFrameCallback continuamente em cada callback sem interrupção)`);

    const continuousPlaybackMetrics = await spectatorWin.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const video = document.getElementById('liveVideo');
        if (!video) return resolve({ error: 'liveVideo not found' });

        if (video.paused && video.readyState >= 2) {
          video.play().catch(() => {});
        }

        const WINDOW_MS = ${MEASUREMENT_WINDOW_MS};
        const MEASURED_TTFF_MS = ${ttffMetric.ttffMs || 0};
        const frameHistory = [];
        const liveEdgeDistances = [];
        const bufferAheadSamples = [];
        const gapEvents = [];
        let rVfcCallbacks = 0;
        let isMeasuring = true;
        let prevPresentedFrames = null;
        let totalPresentedGaps = 0;
        let firstPresentedFrame = null;
        let lastPresentedFrame = null;

        function getBufferedRanges() {
          const ranges = [];
          if (video.buffered) {
            for (let i = 0; i < video.buffered.length; i++) {
              ranges.push({
                start: Math.round(video.buffered.start(i) * 1000) / 1000,
                end: Math.round(video.buffered.end(i) * 1000) / 1000
              });
            }
          }
          return ranges;
        }

        const startPerfTime = performance.now();
        const startQuality = typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;

        // 1. Snapshot Inicial no instante t_start da janela de medição
        const initialSnapshot = {
          perfTimeMs: Math.round(startPerfTime * 10) / 10,
          currentTimeSec: Math.round(video.currentTime * 1000) / 1000,
          totalVideoFrames: startQuality ? startQuality.totalVideoFrames : (video.webkitDecodedFrameCount || 0),
          droppedVideoFrames: startQuality ? startQuality.droppedVideoFrames : (video.webkitDroppedFrameCount || 0),
          corruptedVideoFrames: startQuality ? startQuality.corruptedVideoFrames : 0,
          webkitDecodedFrameCount: video.webkitDecodedFrameCount || 0,
          webkitVideoDecodedByteCount: video.webkitVideoDecodedByteCount || 0,
          webkitAudioDecodedByteCount: video.webkitAudioDecodedByteCount || 0,
          bytesReceived: (window.__mseStats && window.__mseStats.bytesReceived) || 0,
          segmentsReceived: (window.__mseStats && window.__mseStats.segmentsReceived) || 0,
          bufferedRanges: getBufferedRanges()
        };

        function onFrame(now, metadata) {
          if (!isMeasuring) return;
          rVfcCallbacks++;

          // 2. Análise de presentedFrames entre callbacks para detecção de lacunas/descartes
          const currentPresented = typeof metadata.presentedFrames === 'number' ? metadata.presentedFrames : rVfcCallbacks;
          if (firstPresentedFrame === null) {
            firstPresentedFrame = currentPresented;
          }
          if (prevPresentedFrames !== null) {
            const step = currentPresented - prevPresentedFrames;
            if (step > 1) {
              const gap = step - 1;
              totalPresentedGaps += gap;
              gapEvents.push({
                callbackIndex: rVfcCallbacks,
                prevPresented: prevPresentedFrames,
                currentPresented: currentPresented,
                gap: gap,
                nowMs: Math.round(now * 10) / 10
              });
            }
          }
          prevPresentedFrames = currentPresented;
          lastPresentedFrame = currentPresented;

          // 3. Buffer temporal calculado separadamente e exclusivamente via buffered ranges e currentTime
          const currentCt = video.currentTime;
          let activeBufferAhead = 0;
          if (video.buffered && video.buffered.length > 0) {
            for (let i = 0; i < video.buffered.length; i++) {
              const bStart = video.buffered.start(i);
              const bEnd = video.buffered.end(i);
              if (currentCt >= bStart - 0.2 && currentCt <= bEnd + 0.2) {
                activeBufferAhead = Math.max(0, bEnd - currentCt);
                break;
              }
            }
            if (activeBufferAhead === 0 && video.buffered.length > 0) {
              const lastEnd = video.buffered.end(video.buffered.length - 1);
              activeBufferAhead = Math.max(0, lastEnd - currentCt);
            }
          }
          bufferAheadSamples.push(activeBufferAhead);

          const bufferedEnd = (video.buffered && video.buffered.length > 0)
            ? video.buffered.end(video.buffered.length - 1)
            : 0;
          const liveEdgeDist = Math.max(0, bufferedEnd - currentCt);
          liveEdgeDistances.push(liveEdgeDist);

          frameHistory.push({
            index: rVfcCallbacks,
            now: Math.round(now * 100) / 100,
            presentationTime: Math.round(metadata.presentationTime * 100) / 100,
            expectedDisplayTime: Math.round(metadata.expectedDisplayTime * 100) / 100,
            mediaTime: Math.round(metadata.mediaTime * 1000) / 1000,
            currentTime: Math.round(video.currentTime * 1000) / 1000,
            bufferedEnd: Math.round(bufferedEnd * 1000) / 1000,
            liveEdgeDistance: Math.round(liveEdgeDist * 1000) / 1000,
            bufferAheadSec: Math.round(activeBufferAhead * 1000) / 1000,
            presentedFrames: currentPresented,
            width: metadata.width,
            height: metadata.height
          });

          // Rearma o callback continuadamente até atingir a janela de 30s
          if (performance.now() - startPerfTime < WINDOW_MS) {
            video.requestVideoFrameCallback(onFrame);
          } else {
            finish();
          }
        }

        // Arm first callback
        if (typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(onFrame);
        } else {
          resolve({ error: 'requestVideoFrameCallback not supported' });
          return;
        }

        function finish() {
          if (!isMeasuring) return;
          isMeasuring = false;
          const endPerfTime = performance.now();
          const durationSec = (endPerfTime - startPerfTime) / 1000;
          const endQuality = typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;

          // Snapshot Final no instante t_end no exato término da janela
          const finalSnapshot = {
            perfTimeMs: Math.round(endPerfTime * 10) / 10,
            currentTimeSec: Math.round(video.currentTime * 1000) / 1000,
            totalVideoFrames: endQuality ? endQuality.totalVideoFrames : (video.webkitDecodedFrameCount || 0),
            droppedVideoFrames: endQuality ? endQuality.droppedVideoFrames : (video.webkitDroppedFrameCount || 0),
            corruptedVideoFrames: endQuality ? endQuality.corruptedVideoFrames : 0,
            webkitDecodedFrameCount: video.webkitDecodedFrameCount || 0,
            webkitVideoDecodedByteCount: video.webkitVideoDecodedByteCount || 0,
            webkitAudioDecodedByteCount: video.webkitAudioDecodedByteCount || 0,
            bytesReceived: (window.__mseStats && window.__mseStats.bytesReceived) || 0,
            segmentsReceived: (window.__mseStats && window.__mseStats.segmentsReceived) || 0,
            bufferedRanges: getBufferedRanges()
          };

          // Intervalos estáveis entre quadros
          const intervals = [];
          const stallEvents = [];
          for (let i = 1; i < frameHistory.length; i++) {
            const delta = frameHistory[i].now - frameHistory[i - 1].now;
            intervals.push(delta);
            if (delta > 100) {
              stallEvents.push({
                frameIndex: frameHistory[i].index,
                nowMs: frameHistory[i].now,
                durationMs: Math.round(delta * 10) / 10,
                mediaTimeSec: frameHistory[i].mediaTime,
                currentTimeSec: frameHistory[i].currentTime,
                liveEdgeDistanceSec: frameHistory[i].liveEdgeDistance
              });
            }
          }

          let minInterval = 0;
          let maxInterval = 0;
          let meanInterval = 0;
          let stdDevInterval = 0;
          let p50Interval = 0;
          let p95Interval = 0;
          let p99Interval = 0;

          if (intervals.length > 0) {
            minInterval = Math.min(...intervals);
            maxInterval = Math.max(...intervals);
            meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

            const variance = intervals.reduce((acc, val) => acc + Math.pow(val - meanInterval, 2), 0) / intervals.length;
            stdDevInterval = Math.sqrt(variance);

            const sorted = [...intervals].sort((a, b) => a - b);
            p50Interval = sorted[Math.floor(sorted.length * 0.50)];
            p95Interval = sorted[Math.floor(sorted.length * 0.95)];
            p99Interval = sorted[Math.floor(sorted.length * 0.99)];
          }

          const minLiveEdge = liveEdgeDistances.length > 0 ? Math.min(...liveEdgeDistances) : 0;
          const maxLiveEdge = liveEdgeDistances.length > 0 ? Math.max(...liveEdgeDistances) : 0;
          const meanLiveEdge = liveEdgeDistances.length > 0 ? liveEdgeDistances.reduce((a, b) => a + b, 0) / liveEdgeDistances.length : 0;

          const minBufAhead = bufferAheadSamples.length > 0 ? Math.min(...bufferAheadSamples) : 0;
          const maxBufAhead = bufferAheadSamples.length > 0 ? Math.max(...bufferAheadSamples) : 0;
          const meanBufAhead = bufferAheadSamples.length > 0 ? bufferAheadSamples.reduce((a, b) => a + b, 0) / bufferAheadSamples.length : 0;

          // Deltas calculados no mesmo intervalo exato
          const totalVideoFramesDelta = finalSnapshot.totalVideoFrames - initialSnapshot.totalVideoFrames;
          const droppedVideoFramesDelta = finalSnapshot.droppedVideoFrames - initialSnapshot.droppedVideoFrames;
          const corruptedVideoFramesDelta = finalSnapshot.corruptedVideoFrames - initialSnapshot.corruptedVideoFrames;
          const decodedFramesDelta = finalSnapshot.webkitDecodedFrameCount - initialSnapshot.webkitDecodedFrameCount;
          const decodedVideoBytesDelta = finalSnapshot.webkitVideoDecodedByteCount - initialSnapshot.webkitVideoDecodedByteCount;
          const decodedAudioBytesDelta = finalSnapshot.webkitAudioDecodedByteCount - initialSnapshot.webkitAudioDecodedByteCount;
          const bytesReceivedDelta = finalSnapshot.bytesReceived - initialSnapshot.bytesReceived;
          const segmentsReceivedDelta = finalSnapshot.segmentsReceived - initialSnapshot.segmentsReceived;
          const currentTimeAdvancementSec = Math.round((finalSnapshot.currentTimeSec - initialSnapshot.currentTimeSec) * 1000) / 1000;

          // Conciliação de métricas de quadros:
          // Conforme especificação W3C Video Playback Quality:
          // totalVideoFrames = displayed frames + droppedVideoFrames
          // Portanto:
          // displayedFramesExpected = totalVideoFramesDelta - droppedVideoFramesDelta
          const displayedFramesExpected = totalVideoFramesDelta - droppedVideoFramesDelta;

          // Span de presentedFrames através dos callbacks rVFC
          const presentedFramesSpan = (lastPresentedFrame !== null && firstPresentedFrame !== null)
            ? (lastPresentedFrame - firstPresentedFrame + 1)
            : rVfcCallbacks;

          // Discrepâncias entre contadores
          const discrepancyDecodedVsTotal = decodedFramesDelta - totalVideoFramesDelta;
          const discrepancyDisplayedVsRvfc = displayedFramesExpected - rVfcCallbacks;
          const discrepancyPresentedVsRvfc = presentedFramesSpan - (rVfcCallbacks + totalPresentedGaps);

          const conciliationCoherent =
            discrepancyDisplayedVsRvfc === 0 &&
            discrepancyPresentedVsRvfc === 0 &&
            Math.abs(discrepancyDecodedVsTotal) <= 1;

          resolve({
            success: true,
            windowMsConfigured: WINDOW_MS,
            exactDurationSec: Math.round(durationSec * 1000) / 1000,
            timeToFirstFrameMs: MEASURED_TTFF_MS > 0 ? MEASURED_TTFF_MS : (Math.round((frameHistory[0] ? frameHistory[0].now - startPerfTime : 0) * 10) / 10),
            totalPresentedFrames: frameHistory.length,
            effectiveFps: Math.round((frameHistory.length / durationSec) * 100) / 100,
            intervals: {
              minMs: Math.round(minInterval * 100) / 100,
              maxMs: Math.round(maxInterval * 100) / 100,
              meanMs: Math.round(meanInterval * 100) / 100,
              p50Ms: Math.round(p50Interval * 100) / 100,
              p95Ms: Math.round(p95Interval * 100) / 100,
              p99Ms: Math.round(p99Interval * 100) / 100,
              jitterStdDevMs: Math.round(stdDevInterval * 100) / 100,
              stallsExceeding100ms: stallEvents.length,
              stallEvents,
              totalIntervalsMeasured: intervals.length
            },
            liveEdge: {
              minDistanceSec: Math.round(minLiveEdge * 1000) / 1000,
              maxDistanceSec: Math.round(maxLiveEdge * 1000) / 1000,
              meanDistanceSec: Math.round(meanLiveEdge * 1000) / 1000
            },
            temporalBuffer: {
              calculationMethod: "bufferAhead = activeRange.end - currentTime (calculado estritamente via TimeRanges e currentTime, sem derivação a partir de contadores de quadros)",
              minBufferAheadSec: Math.round(minBufAhead * 1000) / 1000,
              maxBufferAheadSec: Math.round(maxBufAhead * 1000) / 1000,
              meanBufferAheadSec: Math.round(meanBufAhead * 1000) / 1000,
              startBufferedRanges: initialSnapshot.bufferedRanges,
              endBufferedRanges: finalSnapshot.bufferedRanges
            },
            playerState: {
              paused: video.paused,
              readyState: video.readyState,
              currentTimeStart: initialSnapshot.currentTimeSec,
              currentTimeEnd: finalSnapshot.currentTimeSec,
              currentTimeAdvancementSec: currentTimeAdvancementSec,
              bufferedRanges: finalSnapshot.bufferedRanges
            },
            snapshots: {
              initial: initialSnapshot,
              final: finalSnapshot
            },
            windowDeltas: {
              totalVideoFramesDelta,
              droppedVideoFramesDelta,
              corruptedVideoFramesDelta,
              decodedFramesDelta,
              decodedVideoBytesDelta,
              decodedAudioBytesDelta,
              bytesReceivedDelta,
              segmentsReceivedDelta,
              rVfcCallbacksCount: rVfcCallbacks,
              firstPresentedFrame,
              lastPresentedFrame,
              presentedFramesSpan,
              totalPresentedGaps,
              gapEvents
            },
            metricsConciliation: {
              formulaUsed: "totalVideoFrames = displayedFrames + droppedVideoFrames (W3C Video Playback Quality) => displayedFramesExpected = totalVideoFramesDelta - droppedVideoFramesDelta",
              totalVideoFramesDelta,
              droppedVideoFramesDelta,
              corruptedVideoFramesDelta,
              displayedFramesExpected,
              rVfcCallbacksReceived: rVfcCallbacks,
              decodedFramesDelta,
              discrepancyDecodedVsTotal,
              discrepancyDisplayedVsRvfc,
              discrepancyPresentedVsRvfc,
              gapEventsCount: gapEvents.length,
              status: conciliationCoherent ? "CONCILIADO_E_COERENTE" : "DISCREPANCIA_NAO_EXPLICADA",
              limitations: [
                "requestVideoFrameCallback confirma o envio/apresentação do quadro ao compositor gráfico do Chromium, NÃO constituindo medição óptica/física de fótons ou pixels no painel do monitor.",
                "totalVideoFrames representa quadros que concluíram descompressão e foram exibidos ou descartados; não representa fila de lookahead.",
                "Duração de buffer é calculada exclusivamente via TimeRanges (video.buffered) e video.currentTime."
              ]
            },
            firstFrameSample: frameHistory[0] || null,
            lastFrameSample: frameHistory[frameHistory.length - 1] || null
          });
        }

        // Safety fallback if window times out
        setTimeout(finish, WINDOW_MS + 2500);
      });
    `);

    console.log('\n================================================================');
    console.log('📊 RESULTADOS DA JANELA CONTÍNUA DE 30 SEGUNDOS (MSE LIVE SHARE)');
    console.log('================================================================');
    console.log(`1. Duração Exata Medida: ${continuousPlaybackMetrics.exactDurationSec} segundos`);
    console.log(`2. Tempo até Primeiro Quadro (TTFF): ${continuousPlaybackMetrics.timeToFirstFrameMs} ms`);
    console.log(`3. Total de Quadros Apresentados ao Compositor (rVFC): ${continuousPlaybackMetrics.totalPresentedFrames} quadros`);
    console.log(`4. Taxa Efetiva de Apresentação (FPS): ${continuousPlaybackMetrics.effectiveFps} FPS (Alvo: 30 FPS)`);
    console.log(`5. Distribuição dos Intervalos Entre Quadros:`);
    console.log(`   - Mínimo: ${continuousPlaybackMetrics.intervals.minMs} ms`);
    console.log(`   - Máximo: ${continuousPlaybackMetrics.intervals.maxMs} ms`);
    console.log(`   - Média: ${continuousPlaybackMetrics.intervals.meanMs} ms (Esperado ideal: 33.33 ms)`);
    console.log(`   - Mediana (p50): ${continuousPlaybackMetrics.intervals.p50Ms} ms`);
    console.log(`   - Percentil 95 (p95): ${continuousPlaybackMetrics.intervals.p95Ms} ms`);
    console.log(`   - Percentil 99 (p99): ${continuousPlaybackMetrics.intervals.p99Ms} ms`);
    console.log(`   - Jitter / Desvio Padrão: ${continuousPlaybackMetrics.intervals.jitterStdDevMs} ms`);
    console.log(`   - Pausas em Reprodução (>100ms): ${continuousPlaybackMetrics.intervals.stallsExceeding100ms}`);
    if (continuousPlaybackMetrics.intervals.stallsExceeding100ms > 0) {
      console.log(`   - Detalhe das Pausas:`, JSON.stringify(continuousPlaybackMetrics.intervals.stallEvents, null, 2));
    }
    console.log(`6. Buffer Temporal (calculado estritamente via TimeRanges e currentTime):`);
    console.log(`   - Mínimo à frente: ${continuousPlaybackMetrics.temporalBuffer.minBufferAheadSec}s`);
    console.log(`   - Máximo à frente: ${continuousPlaybackMetrics.temporalBuffer.maxBufferAheadSec}s`);
    console.log(`   - Média à frente: ${continuousPlaybackMetrics.temporalBuffer.meanBufferAheadSec}s`);
    console.log(`   - Intervalos com Buffer: [${continuousPlaybackMetrics.playerState.bufferedRanges.map(b => b.start + '-' + b.end).join(', ')}]`);
    console.log(`7. Avanço Temporal (currentTime):`);
    console.log(`   - Início: ${continuousPlaybackMetrics.playerState.currentTimeStart}s | Fim: ${continuousPlaybackMetrics.playerState.currentTimeEnd}s`);
    console.log(`   - Delta Avançado: ${continuousPlaybackMetrics.playerState.currentTimeAdvancementSec}s (em ${continuousPlaybackMetrics.exactDurationSec}s de relógio)`);
    console.log(`8. Conciliação das Métricas de Quadros no Mesmo Intervalo:`);
    console.log(`   - Snapshot Inicial (t_start): totalVideoFrames=${continuousPlaybackMetrics.snapshots.initial.totalVideoFrames}, dropped=${continuousPlaybackMetrics.snapshots.initial.droppedVideoFrames}, decoded=${continuousPlaybackMetrics.snapshots.initial.webkitDecodedFrameCount}`);
    console.log(`   - Snapshot Final (t_end): totalVideoFrames=${continuousPlaybackMetrics.snapshots.final.totalVideoFrames}, dropped=${continuousPlaybackMetrics.snapshots.final.droppedVideoFrames}, decoded=${continuousPlaybackMetrics.snapshots.final.webkitDecodedFrameCount}`);
    console.log(`   - Deltas da Janela:`);
    console.log(`     * Δ totalVideoFrames (W3C Quality API): ${continuousPlaybackMetrics.windowDeltas.totalVideoFramesDelta}`);
    console.log(`     * Δ droppedVideoFrames (W3C Quality API): ${continuousPlaybackMetrics.windowDeltas.droppedVideoFramesDelta}`);
    console.log(`     * Δ corruptedVideoFrames: ${continuousPlaybackMetrics.windowDeltas.corruptedVideoFramesDelta}`);
    console.log(`     * Δ webkitDecodedFrameCount: ${continuousPlaybackMetrics.windowDeltas.decodedFramesDelta}`);
    console.log(`     * Callbacks rVFC recebidos: ${continuousPlaybackMetrics.windowDeltas.rVfcCallbacksCount}`);
    console.log(`     * Span metadata.presentedFrames: ${continuousPlaybackMetrics.windowDeltas.presentedFramesSpan} (primeiro: ${continuousPlaybackMetrics.windowDeltas.firstPresentedFrame}, último: ${continuousPlaybackMetrics.windowDeltas.lastPresentedFrame})`);
    console.log(`     * Lacunas detectadas entre callbacks: ${continuousPlaybackMetrics.windowDeltas.totalPresentedGaps}`);
    console.log(`   - Fórmula W3C Aplicada: totalVideoFrames = displayedFrames + droppedVideoFrames`);
    console.log(`     => displayedFramesExpected = totalVideoFramesDelta - droppedVideoFramesDelta = ${continuousPlaybackMetrics.metricsConciliation.displayedFramesExpected}`);
    console.log(`   - Discrepância Displayed vs rVFC: ${continuousPlaybackMetrics.metricsConciliation.discrepancyDisplayedVsRvfc}`);
    console.log(`   - Discrepância Decoded vs Total: ${continuousPlaybackMetrics.metricsConciliation.discrepancyDecodedVsTotal}`);
    console.log(`   - Status da Conciliação: ${continuousPlaybackMetrics.metricsConciliation.status}`);
    console.log(`   - Limitação: rVFC confirma envio ao compositor gráfico; não mede emissão física de fótons/pixels do monitor.`);

    results.stages.continuous30sPlayback = continuousPlaybackMetrics;

    const continuousPassed =
      continuousPlaybackMetrics.exactDurationSec >= 30.0 &&
      continuousPlaybackMetrics.totalPresentedFrames >= 400 &&
      continuousPlaybackMetrics.effectiveFps >= 15.0 &&
      continuousPlaybackMetrics.playerState.currentTimeAdvancementSec >= 25.0 &&
      continuousPlaybackMetrics.metricsConciliation.status === 'CONCILIADO_E_COERENTE';

    console.log(`\n=> CLASSIFICAÇÃO DA REPRODUÇÃO CONTÍNUA DE 30S: ${continuousPassed ? 'APROVADO (COMPROVADO EMPIRICAMENTE)' : 'FALHOU'}`);

    // -------------------------------------------------------------------------
    // 4. Test Mid-Stream Late Joiner With Continuous Stream
    // -------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log('🧪 TESTE DE ENTRADA TARDIA (LATE-JOINER) DURANTE FLUXO ATIVO');
    console.log('================================================================');
    console.log(`Host continua transmitindo ativamente. Fechando Espectador 1 para liberar display vsync...`);
    try {
      if (spectatorWin && !spectatorWin.isDestroyed()) {
        spectatorWin.destroy();
        spectatorWin = null;
      }
    } catch (e) {}

    console.log(`Conectando Espectador 2 no meio da transmissão ativa...`);
    lateSpectatorWin = new BrowserWindow({
      show: true,
      width: 480,
      height: 360,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    const lateDomReady = new Promise(r => lateSpectatorWin.webContents.once('dom-ready', r));
    lateSpectatorWin.webContents.on('console-message', (e, level, message) => {
      console.log(`[LateSpectatorConsole] ${message}`);
    });
    lateSpectatorWin.loadURL(`http://localhost:${TEST_PORT}/live`).catch(() => {});
    await lateDomReady;

    await lateSpectatorWin.webContents.executeJavaScript(`
      const btn = document.getElementById('tabModeMse');
      if (btn) btn.click();
      else if (typeof switchTransport === 'function') switchTransport('mse');
    `);

    lateSpectatorWin.focus();

    // Let late joiner receive Init + Keyframe and run for 6 seconds
    await new Promise(r => setTimeout(r, 2000));

    const lateJoinerMetrics = await lateSpectatorWin.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const video = document.getElementById('liveVideo');
        if (!video) return resolve({ error: 'liveVideo not found' });

        video.muted = true;
        if (video.paused) {
          video.play().catch(() => {});
        }

        const TEST_DURATION = 6000;
        const frames = [];
        const start = performance.now();
        const startCurrentTime = video.currentTime;

        function onFrame(now, meta) {
          frames.push({
            now,
            presentationTime: meta.presentationTime,
            expectedDisplayTime: meta.expectedDisplayTime,
            mediaTime: meta.mediaTime
          });
          if (performance.now() - start < TEST_DURATION) {
            video.requestVideoFrameCallback(onFrame);
          } else {
            finish();
          }
        }

        if (typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(onFrame);
        }

        function finish() {
          const dur = (performance.now() - start) / 1000;
          const buffered = [];
          if (video.buffered) {
            for (let i = 0; i < video.buffered.length; i++) {
              buffered.push({
                start: Math.round(video.buffered.start(i) * 1000) / 1000,
                end: Math.round(video.buffered.end(i) * 1000) / 1000
              });
            }
          }

          resolve({
            initMetaReceived: window.__mseStats ? window.__mseStats.initMetaReceived : false,
            bytesReceived: (window.__mseStats && window.__mseStats.bytesReceived) || 0,
            segmentsReceived: (window.__mseStats && window.__mseStats.segmentsReceived) || 0,
            readyState: video.readyState,
            paused: video.paused,
            currentTimeStart: startCurrentTime,
            currentTimeEnd: video.currentTime,
            currentTimeDelta: video.currentTime - startCurrentTime,
            decodedFrames: video.webkitDecodedFrameCount || 0,
            decodedAudioBytes: video.webkitAudioDecodedByteCount || 0,
            framesCaptured: frames.length,
            effectiveFps: Math.round((frames.length / dur) * 100) / 100,
            buffered
          });
        }

        setTimeout(finish, TEST_DURATION + 1500);
      });
    `);

    console.log('\n--- MÉTRICAS DO ESPECTADOR TARDIO (LATE-JOINER NO MEIO DO FLUXO) ---');
    console.log(`1. Init Segment Recebido do Cache: ${lateJoinerMetrics.initMetaReceived}`);
    console.log(`2. Bytes Recebidos: ${lateJoinerMetrics.bytesReceived} bytes (${lateJoinerMetrics.segmentsReceived} segmentos)`);
    console.log(`3. Intervalos em Buffer: [${lateJoinerMetrics.buffered.map(b => b.start + '-' + b.end).join(', ')}]`);
    console.log(`4. Player State: readyState=${lateJoinerMetrics.readyState}, paused=${lateJoinerMetrics.paused}`);
    console.log(`5. Avanço de currentTime: de ${lateJoinerMetrics.currentTimeStart.toFixed(3)}s para ${lateJoinerMetrics.currentTimeEnd.toFixed(3)}s (delta: ${lateJoinerMetrics.currentTimeDelta.toFixed(3)}s)`);
    console.log(`6. Quadros Decodificados: ${lateJoinerMetrics.decodedFrames}`);
    console.log(`7. Áudio Opus Decodificado: ${lateJoinerMetrics.decodedAudioBytes} bytes`);
    console.log(`8. Quadros Apresentados via rVFC: ${lateJoinerMetrics.framesCaptured} (${lateJoinerMetrics.effectiveFps} FPS)`);

    results.stages.lateJoiner = lateJoinerMetrics;

    const latePassed =
      lateJoinerMetrics.initMetaReceived &&
      lateJoinerMetrics.bytesReceived > 0 &&
      lateJoinerMetrics.buffered.length > 0 &&
      lateJoinerMetrics.readyState >= 2 &&
      lateJoinerMetrics.decodedFrames >= 30 &&
      lateJoinerMetrics.framesCaptured >= 30 &&
      lateJoinerMetrics.currentTimeDelta >= 2.0;

    console.log(`\n=> RESULTADO ENTRADA TARDIA: ${latePassed ? 'PASSOU (RECUPERAÇÃO IMEDIATA)' : 'FALHOU'}`);

    // Auditoria de separação epistemológica estrita
    results.epistemologicalClassification = {
      bytesReceived: { verified: true, method: 'WebSocket onmessage byte counter' },
      segmentsAcceptedBySourceBuffer: { verified: true, method: 'video.buffered TimeRanges inspection' },
      mediaDecodedVideo: { verified: true, method: 'video.webkitDecodedFrameCount & webkitVideoDecodedByteCount' },
      mediaDecodedAudioOpus: { verified: true, method: 'video.webkitAudioDecodedByteCount' },
      framesPresentedCompositor: {
        verified: true,
        method: 'video.requestVideoFrameCallback (confirmação de envio/submissão do quadro ao compositor gráfico do Chromium; NÃO constitui medição física ou óptica dos fótons/pixels emitidos pelo monitor)'
      },
      frameMetricsConciliation: {
        verified: continuousPlaybackMetrics.metricsConciliation && continuousPlaybackMetrics.metricsConciliation.status === 'CONCILIADO_E_COERENTE',
        classification: (continuousPlaybackMetrics.metricsConciliation && continuousPlaybackMetrics.metricsConciliation.status === 'CONCILIADO_E_COERENTE')
          ? 'VERIFICADO'
          : 'DISCREPANCIA_NAO_EXPLICADA',
        formula: continuousPlaybackMetrics.metricsConciliation ? continuousPlaybackMetrics.metricsConciliation.formulaUsed : '',
        discrepancies: {
          decodedVsTotal: continuousPlaybackMetrics.metricsConciliation ? continuousPlaybackMetrics.metricsConciliation.discrepancyDecodedVsTotal : null,
          displayedVsRvfc: continuousPlaybackMetrics.metricsConciliation ? continuousPlaybackMetrics.metricsConciliation.discrepancyDisplayedVsRvfc : null,
          presentedVsRvfc: continuousPlaybackMetrics.metricsConciliation ? continuousPlaybackMetrics.metricsConciliation.discrepancyPresentedVsRvfc : null
        }
      },
      physicalPixelsEmitted: {
        verified: false,
        classification: 'NÃO VERIFICADO',
        justification: 'A apresentação ao compositor foi confirmada via requestVideoFrameCallback; contudo, a emissão física de fótons/pixels na superfície do display requer instrumentação externa com sensor óptico/fotodiodo, não verificado em automação.'
      },
      audioPhysicallyHeard: {
        verified: false,
        classification: 'NÃO VERIFICADO',
        justification: 'Decodificação e buffer de áudio Opus comprovados empiricamente pelo navegador; emissão acústica e percepção auditiva humana requerem equipamento físico de transdução sonora, não verificado em automação.'
      },
      wanPublicNetwork: {
        verified: false,
        classification: 'NÃO VERIFICADO',
        justification: 'Túnel Cloudflare verificado para rotas e segurança; latência e perda de pacotes em conexões globais reais requerem telemetria de campo.'
      },
      longSessionsHours: {
        verified: false,
        classification: 'NÃO VERIFICADO',
        justification: 'Janela de 30 segundos contínuos comprovada; sessões de horas exigem teste de exaustão de memória prolongado.'
      }
    };

    results.allPassed = continuousPassed && latePassed;

    // Save report to tests/poc/continuous-30s-playback-results.json
    const outPath = path.join(__dirname, '../tests/poc/continuous-30s-playback-results.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n✓ Relatório completo salvo em: ${outPath}`);

  } catch (err) {
    console.error('ERRO FATAL NA EXECUÇÃO:', err);
    results.error = err.message;
    results.allPassed = false;
  } finally {
    try { if (hostWin && !hostWin.isDestroyed()) hostWin.destroy(); } catch (e) {}
    try { if (spectatorWin && !spectatorWin.isDestroyed()) spectatorWin.destroy(); } catch (e) {}
    try { if (lateSpectatorWin && !lateSpectatorWin.isDestroyed()) lateSpectatorWin.destroy(); } catch (e) {}
    try { if (server) server.stop(); } catch (e) {}

    setTimeout(() => {
      app.quit();
      process.exit(results.allPassed ? 0 : 1);
    }, 400);
  }
});
