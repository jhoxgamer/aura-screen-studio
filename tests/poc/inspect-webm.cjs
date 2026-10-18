const { app, BrowserWindow } = require('electron');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  await win.loadURL('about:blank');
  const info = await win.webContents.executeJavaScript(`
    (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(30);

      const rec = new MediaRecorder(stream, { mimeType: 'video/webm; codecs="vp8"' });
      const chunks = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      rec.start(200);

      let count = 0;
      const t = setInterval(() => {
        ctx.fillStyle = count % 2 === 0 ? '#ff0000' : '#0000ff';
        ctx.fillRect(0, 0, 320, 240);
        count++;
      }, 33);

      await new Promise(r => setTimeout(r, 1000));
      clearInterval(t);
      rec.stop();
      await new Promise(r => setTimeout(r, 200));

      let totalLen = 0;
      const arrays = [];
      for (const c of chunks) {
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

      // Find first cluster (0x1F 0x43 0xB6 0x75)
      let clusterIdx = -1;
      for (let i = 0; i <= fullStream.length - 4; i++) {
        if (fullStream[i] === 0x1F && fullStream[i+1] === 0x43 && fullStream[i+2] === 0xB6 && fullStream[i+3] === 0x75) {
          clusterIdx = i;
          break;
        }
      }

      const initSegment = fullStream.slice(0, clusterIdx);
      const firstCluster = fullStream.slice(clusterIdx);

      // Test appending initSegment to SourceBuffer!
      const ms = new MediaSource();
      const v = document.createElement('video');
      v.src = URL.createObjectURL(ms);
      await new Promise(r => ms.addEventListener('sourceopen', r, { once: true }));
      const sb = ms.addSourceBuffer('video/webm; codecs="vp8"');

      let initAppendOk = false;
      let clusterAppendOk = false;

      try {
        sb.appendBuffer(initSegment);
        await new Promise(r => sb.addEventListener('updateend', r, { once: true }));
        initAppendOk = true;

        sb.appendBuffer(firstCluster);
        await new Promise(r => sb.addEventListener('updateend', r, { once: true }));
        clusterAppendOk = true;
      } catch (err) {
        console.error('Append error:', err);
      }

      return {
        totalChunksEmitted: chunks.length,
        totalBytes: fullStream.length,
        firstClusterOffset: clusterIdx,
        initSegmentSize: initSegment.length,
        initAppendOk,
        clusterAppendOk,
        bufferedRange: sb.buffered.length > 0 ? [sb.buffered.start(0), sb.buffered.end(0)] : null
      };
    })()
  `);
  console.log('WebM Cluster Parsing & MSE Append Test:', JSON.stringify(info, null, 2));
  win.destroy();
  setTimeout(() => { app.quit(); process.exit(0); }, 50);
});
