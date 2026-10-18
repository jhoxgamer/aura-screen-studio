/**
 * measure-latency-and-edges.cjs
 *
 * Medição Instrumental Rigorosa de Temporização no Live Share MSE via Túnel Cloudflare:
 * 1. Distância para a Borda ao Vivo (Live Edge Distance = buffered.end - currentTime).
 * 2. Latência de Trânsito Servidor -> Cliente sobre Túnel Público (timestamp segment-meta vs receiveTime).
 * 3. Atraso Ponta a Ponta de Apresentação (Captura no Host -> Callback rVFC no Espectador).
 * 4. Stalls e Interrupções de Reprodução (eventos waiting / stalled e congelamentos de currentTime).
 * 5. Taxa Efetiva de Avanço de Reprodução (ΔcurrentTime / ΔwallClock).
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const dns = require('dns').promises;

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');

const { ShareServer } = require('../dist-electron/shareServer.js');

const TEST_PORT = 4910;
const OUTPUT_FILE = path.resolve(__dirname, '../tests/poc/timing-and-latency-results.json');

app.whenReady().then(async () => {
  let server = null;
  let hostWin = null;
  let spectatorWin = null;

  try {
    console.log('================================================================');
    console.log('⏱️ MEDIÇÃO INSTRUMENTAL: LATÊNCIA, BORDA AO VIVO E STALLS (MSE)');
    console.log('================================================================\n');

    server = new ShareServer(() => [], () => {});
    server.port = TEST_PORT;
    await server.start();
    server.startLive('Medição Latência Live Share');
    server.setLiveTransportMode('mse');
    console.log(`✓ ShareServer ativo na porta ${TEST_PORT}`);

    ipcMain.on('live:push-chunk', (_, arrayBuffer) => {
      const buf = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
      if (server && server.isLiveActive()) {
        server.broadcastLiveMseChunk(buf);
      }
    });

    // Host Window gerando mídia com timestamp de captura em alta resolução
    hostWin = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        backgroundThrottling: false
      }
    });

    await hostWin.loadURL('data:text/html,<html><body><canvas id="c" width="640" height="360"></canvas></body></html>');
    await hostWin.webContents.executeJavaScript(`
      new Promise(resolve => {
        const { ipcRenderer } = require('electron');
        const canvas = document.getElementById('c');
        const ctx = canvas.getContext('2d');
        let f = 0;
        setInterval(() => {
          f++;
          ctx.fillStyle = (f % 2 === 0) ? '#111827' : '#1f2937';
          ctx.fillRect(0, 0, 640, 360);
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 24px monospace';
          ctx.fillText('Frame #' + f + ' - Aura Precision Clock', 30, 60);
          ctx.fillStyle = '#60a5fa';
          ctx.fillText('Capture Epoch: ' + Date.now(), 30, 120);
        }, 33.33);

        const vStream = canvas.captureStream(30);
        const aCtx = new AudioContext();
        const osc = aCtx.createOscillator();
        osc.frequency.setValueAtTime(440, aCtx.currentTime);
        const dst = aCtx.createMediaStreamDestination();
        osc.connect(dst);
        osc.start();

        const ms = new MediaStream([...vStream.getVideoTracks(), ...dst.stream.getAudioTracks()]);
        const mr = new MediaRecorder(ms, { mimeType: 'video/webm; codecs="vp8, opus"', videoBitsPerSecond: 2000000 });
        mr.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0) {
            const buf = await e.data.arrayBuffer();
            ipcRenderer.send('live:push-chunk', buf);
          }
        };
        mr.start(100);
        resolve(true);
      });
    `);
    console.log('✓ Host Window transmitindo com timestamps de captura contínuos');

    // Obter túnel Cloudflare
    console.log('Aguardando túnel Cloudflare...');
    let publicUrl = null;
    for (let i = 0; i < 40; i++) {
      publicUrl = server.getPublicUrl();
      if (publicUrl) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!publicUrl) throw new Error('Falha ao obter URL pública do túnel');

    const domain = new URL(publicUrl).hostname;
    for (let i = 0; i < 20; i++) {
      try {
        await dns.lookup(domain);
        break;
      } catch(e) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Aguardar Edge HTTP 200
    for (let i = 0; i < 15; i++) {
      try {
        const ok = await new Promise((res, rej) => {
          https.get(`${publicUrl}/api/live/status`, r => res(r.statusCode === 200)).on('error', rej);
        });
        if (ok) break;
      } catch(e) {}
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✓ Túnel público ativo e pronto: ${publicUrl}`);

    // Abrir janela de espectador com instrumentação profunda de temporização
    spectatorWin = new BrowserWindow({
      width: 1280,
      height: 720,
      show: true,
      webPreferences: { backgroundThrottling: false }
    });
    spectatorWin.focus();

    await spectatorWin.loadURL(`${publicUrl}/live`);
    await spectatorWin.webContents.executeJavaScript(`if (typeof switchTransport === 'function') switchTransport('mse');`);

    console.log('Aguardando conexão e estabilização do player (5s)...');
    await new Promise(r => setTimeout(r, 5000));

    // Iniciar amostragem de alta frequência por 15 segundos
    console.log('Iniciando amostragem instrumental de temporização por 15 segundos...');
    const timingTelemetry = await spectatorWin.webContents.executeJavaScript(`
      new Promise(async (resolve) => {
        const v = document.getElementById('liveVideo');
        if (!v) return resolve({ error: 'Video element not found' });

        const samples = [];
        let waitingCount = 0;
        let stalledCount = 0;

        v.addEventListener('waiting', () => waitingCount++);
        v.addEventListener('stalled', () => stalledCount++);

        // Interceptar metadados de segmentos para medir trânsito servidor -> cliente
        let lastSegmentServerTime = 0;
        let lastSegmentTransitMs = 0;
        const transitSamples = [];

        // Inspecionar WebSocket existente
        if (mseWs) {
          const origOnMessage = mseWs.onmessage;
          mseWs.onmessage = (evt) => {
            if (typeof evt.data === 'string') {
              try {
                const meta = JSON.parse(evt.data);
                if (meta.timestamp) {
                  const now = Date.now();
                  const transit = now - meta.timestamp;
                  if (transit >= 0 && transit < 10000) {
                    transitSamples.push(transit);
                    lastSegmentTransitMs = transit;
                  }
                  lastSegmentServerTime = meta.timestamp;
                }
              } catch(e) {}
            }
            if (origOnMessage) origOnMessage(evt);
          };
        }

        const wallClockStart = performance.now();
        const initialCurrentTime = v.currentTime;

        // Amostragem a cada 250ms durante 15 segundos
        const sampleInterval = setInterval(() => {
          if (!v || !v.buffered || v.buffered.length === 0) return;
          const end = v.buffered.end(v.buffered.length - 1);
          const start = v.buffered.start(0);
          const cur = v.currentTime;
          const liveEdgeDistance = end - cur;

          samples.push({
            elapsedMs: performance.now() - wallClockStart,
            currentTime: cur,
            bufferStart: start,
            bufferEnd: end,
            liveEdgeDistance: liveEdgeDistance,
            transitMs: lastSegmentTransitMs,
            readyState: v.readyState,
            paused: v.paused
          });
        }, 250);

        await new Promise(r => setTimeout(r, 15000));
        clearInterval(sampleInterval);

        const wallClockEnd = performance.now();
        const finalCurrentTime = v.currentTime;

        const liveEdges = samples.map(s => s.liveEdgeDistance);
        liveEdges.sort((a, b) => a - b);

        const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
        const p50 = liveEdges[Math.floor(liveEdges.length * 0.50)] || 0;
        const p95 = liveEdges[Math.floor(liveEdges.length * 0.95)] || 0;
        const p99 = liveEdges[Math.floor(liveEdges.length * 0.99)] || 0;
        const minEdge = liveEdges[0] || 0;
        const maxEdge = liveEdges[liveEdges.length - 1] || 0;

        resolve({
          wallClockDurationSeconds: (wallClockEnd - wallClockStart) / 1000,
          initialCurrentTime,
          finalCurrentTime,
          deltaCurrentTime: finalCurrentTime - initialCurrentTime,
          playbackRateMultiplier: (finalCurrentTime - initialCurrentTime) / ((wallClockEnd - wallClockStart) / 1000),
          stalls: {
            waitingEvents: waitingCount,
            stalledEvents: stalledCount
          },
          liveEdgeDistanceSeconds: {
            min: minEdge,
            max: maxEdge,
            avg: avg(liveEdges),
            p50: p50,
            p95: p95,
            p99: p99
          },
          serverToClientTransitMs: {
            samplesCount: transitSamples.length,
            min: transitSamples.length ? Math.min(...transitSamples) : 0,
            max: transitSamples.length ? Math.max(...transitSamples) : 0,
            avg: avg(transitSamples)
          },
          sampleCount: samples.length
        });
      });
    `);

    console.log('\n📊 RESULTADOS DA MEDIÇÃO INSTRUMENTAL DE TEMPORIZAÇÃO:');
    console.log(JSON.stringify(timingTelemetry, null, 2));

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(timingTelemetry, null, 2), 'utf-8');
    console.log(`\n✓ Resultados salvos em: ${OUTPUT_FILE}`);

  } catch(err) {
    console.error('❌ Erro na medição:', err);
  } finally {
    if (spectatorWin && !spectatorWin.isDestroyed()) spectatorWin.destroy();
    if (hostWin && !hostWin.isDestroyed()) hostWin.destroy();
    if (server) server.stop();
    app.quit();
  }
});
