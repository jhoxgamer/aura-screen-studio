const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Optimize Chromium switches for reliable headless media capture and playback
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');

const { ShareServer } = require('../dist-electron/shareServer.js');

const TEST_PORT = 4595;
const results = {
  timestamp: new Date().toISOString(),
  environment: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch
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
    console.log('🧪 VALIDAÇÃO RIGUROSA: REPRODUÇÃO AUDIOVISUAL REAL & LATE-JOIN');
    console.log('================================================================');

    // 1. Start ShareServer in MSE mode
    server = new ShareServer(() => [], () => {});
    server.port = TEST_PORT;
    server.startTunnel = () => {};
    await server.start();
    server.startLive('Validação Audiovisual Real MSE');
    server.setLiveTransportMode('mse');
    console.log(`✓ ShareServer ativo em http://localhost:${TEST_PORT}/live`);

    ipcMain.on('live:push-chunk', (_, arrayBuffer) => {
      const buf = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
      if (server && server.isLiveActive()) {
        server.broadcastLiveMseChunk(buf);
      }
    });

    // 2. Launch Host Window producing real MediaRecorder stream (Canvas 30FPS + Web Audio 440Hz Sine)
    hostWin = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        backgroundThrottling: false
      }
    });

    await hostWin.loadURL('data:text/html,<html><body><canvas id="c" width="320" height="240"></canvas></body></html>');

    const hostInit = await hostWin.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        try {
          const { ipcRenderer } = require('electron');
          const canvas = document.getElementById('c');
          const ctx = canvas.getContext('2d');
          let frame = 0;

          const draw = () => {
            frame++;
            ctx.fillStyle = (frame % 2 === 0) ? '#0070f3' : '#7928ca';
            ctx.fillRect(0, 0, 320, 240);
            ctx.fillStyle = '#ffffff';
            ctx.font = '20px sans-serif';
            ctx.fillText('Frame #' + frame, 20, 40);
            ctx.fillText('Time: ' + Date.now(), 20, 80);
          };
          setInterval(draw, 33); // ~30 fps

          const vStream = canvas.captureStream(30);

          const audioCtx = new AudioContext();
          const osc = audioCtx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, audioCtx.currentTime); // 440 Hz
          const gain = audioCtx.createGain();
          gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
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

          mr.start(100); // 100ms slices

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

    console.log(`✓ Host iniciou captura real: mime=${hostInit.mime}, videoTracks=${hostInit.videoTracks}, audioTracks=${hostInit.audioTracks}`);
    results.stages.host = hostInit;

    // Allow host to produce first initial chunks and cache Init Segment
    await new Promise(r => setTimeout(r, 600));

    // 3. Connect First Spectator
    spectatorWin = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    const domReady = new Promise(r => spectatorWin.webContents.once('dom-ready', r));
    spectatorWin.loadURL(`http://localhost:${TEST_PORT}/live`).catch(() => {});
    await domReady;

    // Trigger MSE switch
    await spectatorWin.webContents.executeJavaScript(`
      const btn = document.getElementById('tabModeMse');
      if (btn) btn.click();
      else if (typeof switchTransport === 'function') switchTransport('mse');
    `);

    console.log('✓ Espectador 1 conectou e ativou modo MSE. Capturando métricas de reprodução...');

    // Wait 1.8s for initial clusters to arrive and start playback
    await new Promise(r => setTimeout(r, 1800));

    const spec1Metrics = await spectatorWin.webContents.executeJavaScript(`
      new Promise(resolve => {
        const video = document.getElementById('liveVideo');
        if (!video) return resolve({ error: 'liveVideo not found' });

        if (video.paused && video.readyState >= 2) {
          video.play().catch(() => {});
        }

        const frames = [];
        let done = false;

        const startTime = performance.now();
        function onFrame(now, metadata) {
          frames.push({
            presentationTime: metadata.presentationTime,
            expectedDisplayTime: metadata.expectedDisplayTime,
            width: metadata.width,
            height: metadata.height
          });
          if (performance.now() - startTime < 2000 && typeof video.requestVideoFrameCallback === 'function') {
            video.requestVideoFrameCallback(onFrame);
          } else {
            finish();
          }
        }

        if (typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(onFrame);
        }

        function finish() {
          if (done) return;
          done = true;
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
            bytesReceived: (window.__mseStats && window.__mseStats.bytesReceived) || 0,
            segmentsReceived: (window.__mseStats && window.__mseStats.segmentsReceived) || 0,
            paused: video.paused,
            currentTime: video.currentTime,
            readyState: video.readyState,
            buffered,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            decodedFrames: video.webkitDecodedFrameCount || 0,
            decodedVideoBytes: video.webkitVideoDecodedByteCount || 0,
            decodedAudioBytes: video.webkitAudioDecodedByteCount || 0,
            framesCaptured: frames.length,
            sampleFrames: frames.slice(0, 3),
            muted: video.muted
          });
        }

        setTimeout(finish, 2200);
      });
    `);

    console.log('\n--- MÉTRICAS DO ESPECTADOR 1 (REPRODUÇÃO AUDIOVISUAL REAL) ---');
    console.log(`1. Bytes Recebidos: ${spec1Metrics.bytesReceived} bytes (${spec1Metrics.segmentsReceived} segmentos)`);
    console.log(`2. Segmentos Aceitos pelo MediaSource: ${spec1Metrics.buffered.length} intervalos [${spec1Metrics.buffered.map(b => b.start + '-' + b.end).join(', ')}]`);
    console.log(`3. Mídia Decodificada:`);
    console.log(`   - Vídeo: ${spec1Metrics.decodedFrames} quadros (${spec1Metrics.decodedVideoBytes} bytes)`);
    console.log(`   - Áudio (Opus): ${spec1Metrics.decodedAudioBytes} bytes decodificados`);
    console.log(`4. Quadros Apresentados via rVFC: ${spec1Metrics.framesCaptured} confirmados`);
    if (spec1Metrics.sampleFrames && spec1Metrics.sampleFrames.length > 0) {
      console.log(`   - Amostra rVFC: presentationTime=${spec1Metrics.sampleFrames[0].presentationTime}, expectedDisplayTime=${spec1Metrics.sampleFrames[0].expectedDisplayTime}`);
    }
    console.log(`5. Estado do Player: paused=${spec1Metrics.paused}, currentTime=${spec1Metrics.currentTime.toFixed(3)}s, readyState=${spec1Metrics.readyState}`);
    console.log(`6. Autoplay & Áudio: Inicialmente mudo (${spec1Metrics.muted}) para conformidade com a política de autoplay do navegador`);
    console.log(`7. Áudio Ouvido: [NÃO VERIFICADO FISICAMENTE] (Decodificação de bytes Opus: VERIFICADO; Reprodução auditiva humana em autofalante físico: NÃO VERIFICADO em ambiente de automação headless)`);

    results.stages.spectator1 = spec1Metrics;

    const stage1Passed =
      spec1Metrics.bytesReceived > 0 &&
      spec1Metrics.buffered.length > 0 &&
      spec1Metrics.buffered[0].end > spec1Metrics.buffered[0].start &&
      spec1Metrics.decodedFrames > 10 &&
      spec1Metrics.decodedVideoBytes > 10000 &&
      spec1Metrics.decodedAudioBytes > 1000 &&
      spec1Metrics.framesCaptured > 0;

    console.log(`\n=> RESULTADO ETAPA 1 (Reprodução Audiovisual Real): ${stage1Passed ? 'PASSOU (100%)' : 'FALHOU'}`);

    // -----------------------------------------------------------------------
    // 4. Test Late-Joining Spectator (Mid-Stream Entry & Recovery)
    // -----------------------------------------------------------------------
    console.log('\n================================================================');
    console.log('🧪 TESTE DE ENTRADA TARDIA (LATE-JOINER) & RECUPERAÇÃO DE STREAM');
    console.log('================================================================');
    console.log(`Host transmitindo continuamente. Conectando Espectador 2 tardiamente...`);

    lateSpectatorWin = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    const lateDomReady = new Promise(r => lateSpectatorWin.webContents.once('dom-ready', r));
    lateSpectatorWin.loadURL(`http://localhost:${TEST_PORT}/live`).catch(() => {});
    await lateDomReady;

    await lateSpectatorWin.webContents.executeJavaScript(`
      const btn = document.getElementById('tabModeMse');
      if (btn) btn.click();
      else if (typeof switchTransport === 'function') switchTransport('mse');
    `);

    // Wait 1.8s for late joiner to receive cached Init + Keyframe and begin playback
    await new Promise(r => setTimeout(r, 1800));

    const lateMetrics = await lateSpectatorWin.webContents.executeJavaScript(`
      new Promise(resolve => {
        const video = document.getElementById('liveVideo');
        if (!video) return resolve({ error: 'liveVideo not found' });

        if (video.paused && video.readyState >= 2) {
          video.play().catch(() => {});
        }

        const frames = [];
        let done = false;

        const startTime = performance.now();
        function onFrame(now, metadata) {
          frames.push({
            presentationTime: metadata.presentationTime,
            expectedDisplayTime: metadata.expectedDisplayTime,
            width: metadata.width,
            height: metadata.height
          });
          if (performance.now() - startTime < 2000 && typeof video.requestVideoFrameCallback === 'function') {
            video.requestVideoFrameCallback(onFrame);
          } else {
            finish();
          }
        }

        if (typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(onFrame);
        }

        function finish() {
          if (done) return;
          done = true;
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
            paused: video.paused,
            currentTime: video.currentTime,
            readyState: video.readyState,
            buffered,
            decodedFrames: video.webkitDecodedFrameCount || 0,
            decodedVideoBytes: video.webkitVideoDecodedByteCount || 0,
            decodedAudioBytes: video.webkitAudioDecodedByteCount || 0,
            framesCaptured: frames.length,
            sampleFrames: frames.slice(0, 3)
          });
        }

        setTimeout(finish, 2200);
      });
    `);

    console.log('\n--- MÉTRICAS DO ESPECTADOR TARDIO (LATE-JOINER) ---');
    console.log(`1. Init Meta Recebido: ${lateMetrics.initMetaReceived}`);
    console.log(`2. Bytes Recebidos: ${lateMetrics.bytesReceived} bytes`);
    console.log(`3. Intervalos em Buffer: ${lateMetrics.buffered.length} [${lateMetrics.buffered.map(b => b.start + '-' + b.end).join(', ')}]`);
    console.log(`4. Estado do Player: readyState=${lateMetrics.readyState}, currentTime=${lateMetrics.currentTime.toFixed(3)}s, paused=${lateMetrics.paused}`);
    console.log(`5. Quadros Decodificados: ${lateMetrics.decodedFrames} (${lateMetrics.decodedVideoBytes} bytes)`);
    console.log(`6. Áudio Opus Decodificado: ${lateMetrics.decodedAudioBytes} bytes`);
    console.log(`7. Quadros Apresentados via rVFC: ${lateMetrics.framesCaptured}`);
    if (lateMetrics.sampleFrames && lateMetrics.sampleFrames.length > 0) {
      console.log(`   - Amostra rVFC: presentationTime=${lateMetrics.sampleFrames[0].presentationTime}, expectedDisplayTime=${lateMetrics.sampleFrames[0].expectedDisplayTime}`);
    }

    results.stages.lateSpectator = lateMetrics;

    const stage2Passed =
      lateMetrics.initMetaReceived &&
      lateMetrics.bytesReceived > 0 &&
      lateMetrics.buffered.length > 0 &&
      lateMetrics.readyState >= 2 &&
      lateMetrics.decodedFrames > 0 &&
      lateMetrics.framesCaptured > 0;

    console.log(`\n=> RESULTADO ETAPA 2 (Entrada Tardia & Recuperação): ${stage2Passed ? 'PASSOU (100%)' : 'FALHOU'}`);

    // Save test results to disk
    const outPath = path.join(__dirname, '../tests/poc/real-media-reproduction-results.json');
    results.allPassed = stage1Passed && stage2Passed;
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n✓ Resultados completos salvos em: ${outPath}`);

  } catch (err) {
    console.error('ERRO FATAL NA EXECUÇÃO:', err);
    results.error = err.message;
  } finally {
    try { if (hostWin && !hostWin.isDestroyed()) hostWin.destroy(); } catch (e) {}
    try { if (spectatorWin && !spectatorWin.isDestroyed()) spectatorWin.destroy(); } catch (e) {}
    try { if (lateSpectatorWin && !lateSpectatorWin.isDestroyed()) lateSpectatorWin.destroy(); } catch (e) {}
    try { if (server) server.stop(); } catch (e) {}

    setTimeout(() => {
      app.quit();
      process.exit(results.allPassed ? 0 : 1);
    }, 300);
  }
});
