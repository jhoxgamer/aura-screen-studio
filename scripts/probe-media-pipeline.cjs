const { app, BrowserWindow, ipcMain } = require('electron');
const { ShareServer } = require('../dist-electron/shareServer.js');

app.whenReady().then(async () => {
  try {
    const TEST_PORT = 4591;
    const server = new ShareServer(() => [], () => {});
    server.port = TEST_PORT;
    server.startTunnel = () => {};
    server.start();
    server.startLive('Real Media Pipeline Probe');
    server.setLiveTransportMode('mse');

    let accumulator = Buffer.alloc(0);
    let extractedInit = false;
    const CLUSTER_ID = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
    const EBML_ID = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

    ipcMain.on('probe:broadcast-chunk', (_, arrayBuffer) => {
      const buf = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
      accumulator = Buffer.concat([accumulator, buf]);

      if (!extractedInit) {
        const ebmlIdx = accumulator.indexOf(EBML_ID);
        if (ebmlIdx !== -1) {
          if (ebmlIdx > 0) accumulator = accumulator.subarray(ebmlIdx);
          const clusterIdx = accumulator.indexOf(CLUSTER_ID);
          if (clusterIdx !== -1) {
            const initSeg = Buffer.from(accumulator.subarray(0, clusterIdx));
            accumulator = accumulator.subarray(clusterIdx);
            extractedInit = true;
            console.log('[PACKETIZER] Extracted pure Init Segment, size:', initSeg.length);
            server.broadcastLiveMseChunk(initSeg);
          }
        }
      }

      if (extractedInit) {
        while (true) {
          const nextClusterIdx = accumulator.indexOf(CLUSTER_ID, 4);
          if (nextClusterIdx === -1) break;
          const cluster = Buffer.from(accumulator.subarray(0, nextClusterIdx));
          accumulator = accumulator.subarray(nextClusterIdx);
          const isKeyframe = cluster.includes(Buffer.from([0x9d, 0x01, 0x2a]));
          console.log('[PACKETIZER] Dispatched Cluster, size:', cluster.length, 'keyframe:', isKeyframe);
          server.broadcastLiveMseChunk(cluster);
        }
      }
    });

    // 1. Host window generating synthetic video and audio
    const hostWin = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        backgroundThrottling: false
      }
    });

    await hostWin.loadURL('data:text/html,<html><body><canvas id="c" width="320" height="240"></canvas></body></html>');

    const hostStarted = await hostWin.webContents.executeJavaScript(`
      new Promise(resolve => {
        const { ipcRenderer } = require('electron');
        const canvas = document.getElementById('c');
        const ctx = canvas.getContext('2d');
        let frame = 0;

        const draw = () => {
          frame++;
          ctx.fillStyle = (frame % 2 === 0) ? '#ff0055' : '#00aaff';
          ctx.fillRect(0, 0, 320, 240);
          ctx.fillStyle = '#ffffff';
          ctx.font = '24px sans-serif';
          ctx.fillText('Frame: ' + frame + ' t=' + Date.now(), 20, 50);
        };
        setInterval(draw, 33);

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

        const mime = 'video/webm;codecs=vp8,opus';
        const mr = new MediaRecorder(combinedStream, { mimeType: mime });
        let chunkCount = 0;
        mr.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0) {
            chunkCount++;
            const buf = await e.data.arrayBuffer();
            ipcRenderer.send('probe:broadcast-chunk', buf);
          }
        };
        mr.start(100);
        resolve({ started: true, mime, audioTracks: combinedStream.getAudioTracks().length });
      });
    `);
    console.log('[PROBE] Host started MediaRecorder:', hostStarted);

    // Wait 500ms for initial chunks
    await new Promise(r => setTimeout(r, 500));

    // 2. Spectator window connecting to /live
    const specWin = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    });

    specWin.webContents.on('console-message', (_, l, m) => console.log('[SPEC LOG]', m));
    const domReady = new Promise(r => specWin.webContents.once('dom-ready', r));
    specWin.loadURL(`http://localhost:${TEST_PORT}/live`).catch(() => {});
    await domReady;

    console.log('[PROBE] Spectator page loaded.');

    // Wait 2.5s for playback and requestVideoFrameCallback
    await new Promise(r => setTimeout(r, 2500));

    const playbackStats = await specWin.webContents.executeJavaScript(`
      new Promise(resolve => {
        const video = document.getElementById('liveVideo');
        if (!video) return resolve({ error: 'no video element' });

        let frameCallbacks = 0;
        const frames = [];

        function onFrame(now, metadata) {
          frameCallbacks++;
          frames.push({
            presentationTime: metadata.presentationTime,
            expectedDisplayTime: metadata.expectedDisplayTime,
            width: metadata.width,
            height: metadata.height
          });
          if (frameCallbacks < 5 && typeof video.requestVideoFrameCallback === 'function') {
            video.requestVideoFrameCallback(onFrame);
          } else {
            finish();
          }
        }

        if (typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(onFrame);
        }

        function finish() {
          const buffered = [];
          if (video.buffered) {
            for (let i = 0; i < video.buffered.length; i++) {
              buffered.push({ start: video.buffered.start(i), end: video.buffered.end(i) });
            }
          }

          resolve({
            paused: video.paused,
            currentTime: video.currentTime,
            duration: video.duration,
            readyState: video.readyState,
            buffered,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            webkitDecodedFrameCount: video.webkitDecodedFrameCount,
            webkitVideoDecodedByteCount: video.webkitVideoDecodedByteCount,
            webkitAudioDecodedByteCount: video.webkitAudioDecodedByteCount,
            frameCallbacks,
            frames
          });
        }

        // Timeout fallback after 1.5s
        setTimeout(finish, 1500);
      });
    `);

    console.log('[PROBE] Spectator Playback Stats:\n', JSON.stringify(playbackStats, null, 2));

    server.stop();
    hostWin.destroy();
    specWin.destroy();
  } catch (err) {
    console.error('[PROBE ERROR]', err);
  } finally {
    app.quit();
    process.exit(0);
  }
});
