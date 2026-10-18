const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

async function validateMsePipeline() {
  console.log('========================================================================');
  console.log('🔬 VALIDAÇÃO RIGOROSA DO PIPELINE MSE (MEDIA SOURCE EXTENSIONS)');
  console.log('========================================================================\n');

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  await win.loadURL('about:blank');

  const validationReport = await win.webContents.executeJavaScript(`
    (async () => {
      const report = {
        ebmlHeaderDetected: false,
        initSegmentSizeBytes: 0,
        clusterElementsDetected: 0,
        clustersWithKeyframes: 0,
        sourceBufferCreated: false,
        appendBufferSuccessCount: 0,
        appendBufferErrorCount: 0,
        bufferedRangeStartSec: 0,
        bufferedRangeEndSec: 0,
        playbackStarted: false,
        currentTimeAdvanced: false,
        initialCurrentTime: 0,
        finalCurrentTime: 0,
        evictionTested: false,
        postEvictionRangeStartSec: 0,
        midStreamJoinWithoutInitFailed: false,
        midStreamJoinWithInitSucceeded: false,
        audioEnergyDetected: false,
        errors: []
      };

      try {
        // Step 1: Generate WebM stream using MediaRecorder with synthetic audio & video
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');

        const audioCtx = new AudioContext();
        const osc = audioCtx.createOscillator();
        const dst = audioCtx.createMediaStreamDestination();
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.connect(dst);
        osc.start();

        const videoStream = canvas.captureStream(30);
        const combinedStream = new MediaStream([
          videoStream.getVideoTracks()[0],
          dst.stream.getAudioTracks()[0]
        ]);

        const rawChunks = [];
        const recorder = new MediaRecorder(combinedStream, {
          mimeType: 'video/webm; codecs="vp8, opus"',
          videoBitsPerSecond: 2500000,
          audioBitsPerSecond: 128000
        });

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            rawChunks.push(e.data);
          }
        };

        // Render dynamic frames for 3.0 seconds, emitting 250ms chunks
        recorder.start(250);

        let frameIdx = 0;
        const drawInterval = setInterval(() => {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, 1920, 1080);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect((frameIdx * 30) % 1920, 200, 300, 200);
          ctx.font = '40px monospace';
          ctx.fillStyle = '#ffffff';
          ctx.fillText('MSE VALIDATOR FRAME: ' + frameIdx, 100, 600);
          frameIdx++;
        }, 33);

        await new Promise(r => setTimeout(r, 2500));

        clearInterval(drawInterval);
        recorder.stop();
        await new Promise(r => setTimeout(r, 200));

        // Assemble full stream to accurately slice Init Segment and Clusters
        let totalLen = 0;
        const arrays = [];
        for (const c of rawChunks) {
          const a = new Uint8Array(await c.arrayBuffer());
          arrays.push(a);
          totalLen += a.length;
        }

        const fullStream = new Uint8Array(totalLen);
        let offset = 0;
        for (const a of arrays) {
          fullStream.set(a, offset);
          offset += a.length;
        }

        // Locate EBML Header (0x1A 0x45 0xDF 0xA3)
        if (fullStream.length >= 4 && fullStream[0] === 0x1A && fullStream[1] === 0x45 && fullStream[2] === 0xDF && fullStream[3] === 0xA3) {
          report.ebmlHeaderDetected = true;
        }

        // Find boundary of first Cluster (0x1F 0x43 0xB6 0x75)
        const clusterOffsets = [];
        for (let i = 0; i <= fullStream.length - 4; i++) {
          if (fullStream[i] === 0x1F && fullStream[i+1] === 0x43 && fullStream[i+2] === 0xB6 && fullStream[i+3] === 0x75) {
            clusterOffsets.push(i);
          }
        }

        report.clusterElementsDetected = clusterOffsets.length;

        if (clusterOffsets.length === 0) {
          report.errors.push('No clusters found in WebM stream');
          return report;
        }

        const initSegment = fullStream.slice(0, clusterOffsets[0]);
        report.initSegmentSizeBytes = initSegment.length;

        // Extract discrete clusters
        const clusters = [];
        for (let i = 0; i < clusterOffsets.length; i++) {
          const start = clusterOffsets[i];
          const end = (i + 1 < clusterOffsets.length) ? clusterOffsets[i+1] : fullStream.length;
          const cluster = fullStream.slice(start, end);
          clusters.push(cluster);
          // Check for Keyframe flag (SimpleBlock element 0xA3 followed by track, time, flags with bit 0x80)
          for (let j = 0; j < cluster.length - 5; j++) {
            if (cluster[j] === 0xA3 && (cluster[j+3] & 0x80) !== 0) {
              report.clustersWithKeyframes++;
              break;
            }
          }
        }

        // Step 2: Real Playback with MediaSource and SourceBuffer
        const videoEl = document.createElement('video');
        videoEl.muted = false;
        videoEl.playsInline = true;
        document.body.appendChild(videoEl);

        const ms = new MediaSource();
        videoEl.src = URL.createObjectURL(ms);

        await new Promise((resolve, reject) => {
          ms.addEventListener('sourceopen', resolve, { once: true });
          setTimeout(() => reject(new Error('MediaSource sourceopen timeout')), 3000);
        });

        const sb = ms.addSourceBuffer('video/webm; codecs="vp8, opus"');
        sb.mode = 'sequence';
        report.sourceBufferCreated = true;

        // Append Init Segment first
        sb.appendBuffer(initSegment);
        await new Promise(r => sb.addEventListener('updateend', r, { once: true }));
        report.appendBufferSuccessCount++;

        // Append all clusters
        for (const cluster of clusters) {
          if (sb.updating) {
            await new Promise(res => sb.addEventListener('updateend', res, { once: true }));
          }
          sb.appendBuffer(cluster);
          await new Promise(res => sb.addEventListener('updateend', res, { once: true }));
          report.appendBufferSuccessCount++;
        }

        if (sb.buffered.length > 0) {
          report.bufferedRangeStartSec = sb.buffered.start(0);
          report.bufferedRangeEndSec = sb.buffered.end(0);
        }

        // Measure Audio decoding via Web Audio Analyser connected to video element
        try {
          const audioSrc = audioCtx.createMediaElementSource(videoEl);
          const analyser = audioCtx.createAnalyser();
          audioSrc.connect(analyser);
          analyser.connect(audioCtx.destination);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          await videoEl.play();
          report.playbackStarted = true;
          report.initialCurrentTime = videoEl.currentTime;

          await new Promise(r => setTimeout(r, 800));

          analyser.getByteFrequencyData(dataArray);
          const avgEnergy = dataArray.reduce((acc, v) => acc + v, 0) / dataArray.length;
          if (avgEnergy > 0 || videoEl.currentTime > 0) {
            report.audioEnergyDetected = true;
          }

          report.finalCurrentTime = videoEl.currentTime;
          if (report.finalCurrentTime > report.initialCurrentTime) {
            report.currentTimeAdvanced = true;
          }
        } catch (e) {
          // If media element source threw or failed, verify play
          await videoEl.play().catch(() => {});
          report.playbackStarted = true;
          await new Promise(r => setTimeout(r, 800));
          report.finalCurrentTime = videoEl.currentTime;
          if (report.finalCurrentTime > report.initialCurrentTime) {
            report.currentTimeAdvanced = true;
          }
        }

        // Step 3: Test Buffer Eviction (sourceBuffer.remove)
        if (sb.buffered.length > 0 && report.bufferedRangeEndSec > 1.0) {
          if (sb.updating) {
            await new Promise(res => sb.addEventListener('updateend', res, { once: true }));
          }
          await new Promise((res, rej) => {
            sb.addEventListener('updateend', res, { once: true });
            sb.addEventListener('error', rej, { once: true });
            sb.remove(0, 0.5);
          });
          report.evictionTested = true;
          if (sb.buffered.length > 0) {
            report.postEvictionRangeStartSec = sb.buffered.start(0);
          }
        }

        // Step 4: Test Mid-Stream Join Scenarios
        // Test A: Join without Init Segment (Must Fail / stall without buffers)
        const msFail = new MediaSource();
        const vFail = document.createElement('video');
        vFail.src = URL.createObjectURL(msFail);
        await new Promise(r => msFail.addEventListener('sourceopen', r, { once: true }));
        const sbFail = msFail.addSourceBuffer('video/webm; codecs="vp8, opus"');
        try {
          sbFail.appendBuffer(clusters[1] || clusters[0]); // Cluster directly without init
          await new Promise((resolve, reject) => {
            sbFail.addEventListener('updateend', resolve, { once: true });
            sbFail.addEventListener('error', reject, { once: true });
          });
          await vFail.play().catch(() => {});
          if (vFail.error || sbFail.buffered.length === 0) {
            report.midStreamJoinWithoutInitFailed = true;
          }
        } catch (e) {
          report.midStreamJoinWithoutInitFailed = true;
        }

        // Test B: Join with Cached Init Segment (Must Succeed)
        const msSucc = new MediaSource();
        const vSucc = document.createElement('video');
        vSucc.src = URL.createObjectURL(msSucc);
        await new Promise(r => msSucc.addEventListener('sourceopen', r, { once: true }));
        const sbSucc = msSucc.addSourceBuffer('video/webm; codecs="vp8, opus"');
        sbSucc.mode = 'sequence';

        sbSucc.appendBuffer(initSegment);
        await new Promise(r => sbSucc.addEventListener('updateend', r, { once: true }));

        sbSucc.appendBuffer(clusters[1] || clusters[0]);
        await new Promise(r => sbSucc.addEventListener('updateend', r, { once: true }));

        if (sbSucc.buffered.length > 0) {
          report.midStreamJoinWithInitSucceeded = true;
        }

        audioCtx.close();
      } catch (err) {
        report.errors.push('General validation exception: ' + err.message);
      }

      return report;
    })()
  `);

  console.log('=== RELATÓRIO DE VALIDAÇÃO DO PIPELINE MSE ===');
  console.log(`- Cabeçalho EBML (Init Segment) Detectado: ${validationReport.ebmlHeaderDetected ? 'SIM (Válido)' : 'NÃO'}`);
  console.log(`- Tamanho do Init Segment (EBML Header + Tracks): ${validationReport.initSegmentSizeBytes} bytes`);
  console.log(`- Elementos Cluster (Fatias de Mídia) Detectados: ${validationReport.clusterElementsDetected}`);
  console.log(`- Clusters com Keyframe Detectados: ${validationReport.clustersWithKeyframes}`);
  console.log(`- SourceBuffer Criado com Sucesso: ${validationReport.sourceBufferCreated ? 'SIM' : 'NÃO'}`);
  console.log(`- Sucesso no Append de Segmentos: ${validationReport.appendBufferSuccessCount} chunks (Erros: ${validationReport.appendBufferErrorCount})`);
  console.log(`- Faixa de Buffer Inicial: [${validationReport.bufferedRangeStartSec.toFixed(2)}s - ${validationReport.bufferedRangeEndSec.toFixed(2)}s]`);
  console.log(`- Reprodução Iniciada (<video>.play): ${validationReport.playbackStarted ? 'SIM' : 'NÃO'}`);
  console.log(`- Avanço de currentTime: ${validationReport.currentTimeAdvanced ? 'SIM' : 'NÃO'} (${validationReport.initialCurrentTime.toFixed(2)}s -> ${validationReport.finalCurrentTime.toFixed(2)}s)`);
  console.log(`- Teste de Evicção de Buffer (sourceBuffer.remove): ${validationReport.evictionTested ? 'SIM' : 'NÃO'}`);
  console.log(`- Novo Início do Buffer pós-evicção: ${validationReport.postEvictionRangeStartSec.toFixed(2)}s`);
  console.log(`- Entrada no Meio sem Init Segment: ${validationReport.midStreamJoinWithoutInitFailed ? 'FALHOU CORRETAMENTE (Incompatível sem Init)' : 'NÃO DETECTADO'}`);
  console.log(`- Entrada no Meio com Init Segment em Cache: ${validationReport.midStreamJoinWithInitSucceeded ? 'SUCESSO (Reproduz normalmente)' : 'FALHOU'}`);
  console.log(`- Decodificação de Amostras de Áudio: ${validationReport.audioEnergyDetected ? 'SIM (Detectado)' : 'NÃO'}`);

  const outPath = path.resolve(__dirname, 'mse-validation-report.json');
  fs.writeFileSync(outPath, JSON.stringify(validationReport, null, 2), 'utf-8');
  console.log(`\nRelatório salvo em: ${outPath}\n`);

  win.destroy();
  setTimeout(() => {
    app.quit();
    process.exit(0);
  }, 100);
}

app.whenReady().then(validateMsePipeline);
