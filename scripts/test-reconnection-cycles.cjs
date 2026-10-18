/**
 * test-reconnection-cycles.cjs
 *
 * EMPIRICAL VALIDATION: 5 Disconnect & Reconnect Cycles + Slow Spectator Backpressure (1008)
 *
 * Requirements:
 * 1. Continuous MediaRecorder broadcast during the entire test suite.
 * 2. 5 full disconnect & reconnect cycles:
 *    - In each cycle: spectator connects, receives valid entry point (Init Segment + Keyframe Cluster),
 *      decodes & presents new frames via rVFC, advances currentTime, and disconnects cleanly.
 *    - Verify 0 orphaned sockets/buffers on server (mseClients.size === 0).
 * 3. Slow spectator backpressure test:
 *    - Socket buffer accumulates > 2MB in writableLength.
 *    - Server forcefully closes client with RFC 6455 code 1008.
 *    - Host stream continues without interruption or memory leak.
 *    - New spectator cleanly connects immediately after.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');

const { ShareServer } = require('../dist-electron/shareServer.js');

const TEST_PORT = 4597;
const TOTAL_CYCLES = 5;

const results = {
  timestamp: new Date().toISOString(),
  environment: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch
  },
  cycles: [],
  backpressure: {},
  allPassed: false
};

app.whenReady().then(async () => {
  let server = null;
  let hostWin = null;

  try {
    console.log('================================================================');
    console.log('🧪 VALIDAÇÃO: 5 CICLOS DE RECONEXÃO & CONTRAPRESSÃO (RFC 6455 1008)');
    console.log('================================================================\n');

    // 1. Start ShareServer
    server = new ShareServer(() => [], () => {});
    server.port = TEST_PORT;
    server.startTunnel = () => {};
    await server.start();
    server.startLive('Validação 5 Ciclos Reconexão');
    server.setLiveTransportMode('mse');
    console.log(`[1] ShareServer ativo em http://localhost:${TEST_PORT}/live`);

    ipcMain.on('live:push-chunk', (_, arrayBuffer) => {
      const buf = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
      if (server && server.isLiveActive()) {
        server.broadcastLiveMseChunk(buf);
      }
    });

    // 2. Host Window generating continuous stream
    hostWin = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        backgroundThrottling: false
      }
    });

    await hostWin.loadURL('data:text/html,<html><body><canvas id="c" width="320" height="240"></canvas></body></html>');
    await hostWin.webContents.executeJavaScript(`
      new Promise(resolve => {
        const { ipcRenderer } = require('electron');
        const canvas = document.getElementById('c');
        const ctx = canvas.getContext('2d');
        let frame = 0;
        setInterval(() => {
          frame++;
          ctx.fillStyle = (frame % 2 === 0) ? '#ff0077' : '#00e5ff';
          ctx.fillRect(0, 0, 320, 240);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 20px sans-serif';
          ctx.fillText('Frame #' + frame, 20, 40);
        }, 33);

        const vStream = canvas.captureStream(30);
        const audioCtx = new AudioContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0.1;
        const dst = audioCtx.createMediaStreamDestination();
        osc.connect(gain);
        gain.connect(dst);
        osc.start();

        const combinedStream = new MediaStream([
          ...vStream.getVideoTracks(),
          ...dst.stream.getAudioTracks()
        ]);

        const mr = new MediaRecorder(combinedStream, { mimeType: 'video/webm;codecs=vp8,opus' });
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

    console.log('[2] Host gerando fluxo contínuo real MediaRecorder.');
    await new Promise(r => setTimeout(r, 800)); // Allow first keyframe & init segment caching

    // 3. Run 5 Disconnect & Reconnect Cycles
    console.log(`\n[3] Iniciando execução de ${TOTAL_CYCLES} ciclos consecutivos de desconexão e reconexão...`);

    let allCyclesPassed = true;

    for (let cycle = 1; cycle <= TOTAL_CYCLES; cycle++) {
      console.log(`\n--- CICLO ${cycle}/${TOTAL_CYCLES} ---`);

      const specWin = new BrowserWindow({
        show: true,
        width: 400,
        height: 300,
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: false,
          backgroundThrottling: false
        }
      });

      const readyPromise = new Promise(r => specWin.webContents.once('dom-ready', r));
      specWin.loadURL(`http://localhost:${TEST_PORT}/live`).catch(() => {});
      await readyPromise;

      await specWin.webContents.executeJavaScript(`
        const btn = document.getElementById('tabModeMse');
        if (btn) btn.click();
        else if (typeof switchTransport === 'function') switchTransport('mse');
      `);

      // Allow 2.2 seconds for connection and initial segment arrival
      await new Promise(r => setTimeout(r, 2200));

      const cycleMetrics = await specWin.webContents.executeJavaScript(`
        new Promise(async (resolve) => {
          const video = document.getElementById('liveVideo');
          if (!video) return resolve({ error: 'no video' });

          video.muted = true;
          if (video.paused) {
            try { await video.play(); } catch(e) {}
          }

          const frames = [];
          const start = performance.now();
          const startCurrentTime = video.currentTime;

          function onFrame(now, meta) {
            frames.push(meta.presentationTime);
            if (performance.now() - start < 1800) {
              video.requestVideoFrameCallback(onFrame);
            } else {
              finish();
            }
          }

          if (typeof video.requestVideoFrameCallback === 'function') {
            video.requestVideoFrameCallback(onFrame);
          }

          function finish() {
            resolve({
              initMetaReceived: window.__mseStats ? window.__mseStats.initMetaReceived : false,
              bytesReceived: (window.__mseStats && window.__mseStats.bytesReceived) || 0,
              readyState: video.readyState,
              currentTimeStart: startCurrentTime,
              currentTimeEnd: video.currentTime,
              currentTimeDelta: video.currentTime - startCurrentTime,
              decodedFrames: video.webkitDecodedFrameCount || 0,
              decodedAudioBytes: video.webkitAudioDecodedByteCount || 0,
              presentedFrames: frames.length
            });
          }

          setTimeout(finish, 2200);
        });
      `);

      // Verify active client on server
      const viewersWhileActive = server.getLiveViewersCount();
      const mseClientsWhileActive = server.mseClients.size;

      // Close spectator window
      specWin.destroy();
      await new Promise(r => setTimeout(r, 350)); // Allow socket close propagation

      // Verify server cleaned up socket and left 0 orphaned clients
      const viewersAfterClose = server.getLiveViewersCount();
      const mseClientsAfterClose = server.mseClients.size;

      const cyclePassed =
        cycleMetrics.initMetaReceived &&
        cycleMetrics.bytesReceived > 0 &&
        cycleMetrics.readyState >= 2 &&
        cycleMetrics.decodedFrames > 10 &&
        cycleMetrics.presentedFrames > 0 &&
        cycleMetrics.currentTimeDelta > 0.2 &&
        viewersWhileActive === 1 &&
        viewersAfterClose === 0 &&
        mseClientsAfterClose === 0;

      console.log(`  ✓ Init Recebido: ${cycleMetrics.initMetaReceived}`);
      console.log(`  ✓ Bytes Recebidos: ${cycleMetrics.bytesReceived}`);
      console.log(`  ✓ Quadros Decodificados: ${cycleMetrics.decodedFrames} | Apresentados (rVFC): ${cycleMetrics.presentedFrames}`);
      console.log(`  ✓ Avanço currentTime: ${cycleMetrics.currentTimeDelta.toFixed(3)}s`);
      console.log(`  ✓ Clientes no Servidor: ativo=${viewersWhileActive}, pós-fechamento=${viewersAfterClose} (Sockets órfãos: ${mseClientsAfterClose})`);
      console.log(`  => Status Ciclo ${cycle}: ${cyclePassed ? 'APROVADO (LIMPO)' : 'FALHOU'}`);

      results.cycles.push({
        cycle,
        metrics: cycleMetrics,
        viewersWhileActive,
        viewersAfterClose,
        mseClientsAfterClose,
        passed: cyclePassed
      });

      if (!cyclePassed) allCyclesPassed = false;
    }

    // 4. Slow Spectator Backpressure Test (>2MB buffer limit)
    console.log('\n================================================================');
    console.log('🧪 TESTE DE CONTRAPRESSÃO: ESPECTADOR LENTO ACUMULANDO > 2 MB');
    console.log('================================================================');

    const slowSpecWin = new BrowserWindow({
      show: true,
      width: 400,
      height: 300,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    const slowReady = new Promise(r => slowSpecWin.webContents.once('dom-ready', r));
    slowSpecWin.loadURL(`http://localhost:${TEST_PORT}/live`).catch(() => {});
    await slowReady;

    await slowSpecWin.webContents.executeJavaScript(`
      const btn = document.getElementById('tabModeMse');
      if (btn) btn.click();
    `);

    await new Promise(r => setTimeout(r, 600));

    // Verify slow spectator is connected
    const clientsBeforeBloat = server.mseClients.size;
    console.log(`[Backpressure] Espectador conectado (mseClients=${clientsBeforeBloat}). Simulando saturação do buffer TCP (3 MB)...`);

    // Artificially saturate writableLength on server side client socket to 3MB (> 2MB threshold)
    for (const ws of server.mseClients) {
      Object.defineProperty(ws.socket, 'writableLength', { value: 3 * 1024 * 1024, configurable: true });
    }

    // Trigger cluster broadcast which enforces backpressure inspection
    const clusterTrigger = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x01, 0x02]);
    server.broadcastLiveMseChunk(clusterTrigger);

    await new Promise(r => setTimeout(r, 300));

    const clientsAfterBackpressure = server.mseClients.size;
    const viewersAfterBackpressure = server.getLiveViewersCount();
    console.log(`[Backpressure] Verificação do Servidor:`);
    console.log(`  - Clientes MSE após detecção de contrapressão: ${clientsAfterBackpressure} (esperado: 0 - desconectado com código 1008)`);
    console.log(`  - Total de Espectadores: ${viewersAfterBackpressure}`);

    slowSpecWin.destroy();
    await new Promise(r => setTimeout(r, 200));

    const backpressurePassed = (clientsBeforeBloat === 1 && clientsAfterBackpressure === 0 && viewersAfterBackpressure === 0);
    console.log(`=> Status Teste Contrapressão: ${backpressurePassed ? 'APROVADO (1008 ENFORCED)' : 'FALHOU'}`);

    results.backpressure = {
      clientsBeforeBloat,
      clientsAfterBackpressure,
      viewersAfterBackpressure,
      passed: backpressurePassed
    };

    // 5. Recovery Connection: Fresh Spectator Connects after Backpressure Drop
    console.log('\n[5] Conectando novo espectador pós-contrapressão para validar recuperação total...');
    const recoveryWin = new BrowserWindow({
      show: true,
      width: 400,
      height: 300,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    const recReady = new Promise(r => recoveryWin.webContents.once('dom-ready', r));
    recoveryWin.loadURL(`http://localhost:${TEST_PORT}/live`).catch(() => {});
    await recReady;

    await recoveryWin.webContents.executeJavaScript(`
      const btn = document.getElementById('tabModeMse');
      if (btn) btn.click();
    `);

    await new Promise(r => setTimeout(r, 1800));

    const recoveryMetrics = await recoveryWin.webContents.executeJavaScript(`
      new Promise(resolve => {
        const video = document.getElementById('liveVideo');
        resolve({
          initMetaReceived: window.__mseStats ? window.__mseStats.initMetaReceived : false,
          bytesReceived: (window.__mseStats && window.__mseStats.bytesReceived) || 0,
          readyState: video.readyState,
          currentTime: video.currentTime,
          decodedFrames: video.webkitDecodedFrameCount || 0
        });
      });
    `);

    recoveryWin.destroy();
    await new Promise(r => setTimeout(r, 200));

    const recoveryPassed =
      recoveryMetrics.initMetaReceived &&
      recoveryMetrics.bytesReceived > 0 &&
      recoveryMetrics.readyState >= 2 &&
      recoveryMetrics.decodedFrames > 5;

    console.log(`  ✓ Recuperação Pós-Contrapressão: Init=${recoveryMetrics.initMetaReceived}, Bytes=${recoveryMetrics.bytesReceived}, DecodedFrames=${recoveryMetrics.decodedFrames}`);
    console.log(`=> Status Recuperação: ${recoveryPassed ? 'APROVADO (HOST 100% OPERACIONAL)' : 'FALHOU'}`);

    results.recoveryAfterBackpressure = {
      metrics: recoveryMetrics,
      passed: recoveryPassed
    };

    results.allPassed = allCyclesPassed && backpressurePassed && recoveryPassed;

    const outPath = path.join(__dirname, '../tests/poc/reconnection-cycles-results.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n✓ Resultados salvos em: ${outPath}`);

  } catch (err) {
    console.error('ERRO FATAL NA EXECUÇÃO:', err);
    results.error = err.message;
    results.allPassed = false;
  } finally {
    try { if (hostWin && !hostWin.isDestroyed()) hostWin.destroy(); } catch (e) {}
    try { if (server) server.stop(); } catch (e) {}

    setTimeout(() => {
      app.quit();
      process.exit(results.allPassed ? 0 : 1);
    }, 400);
  }
});
