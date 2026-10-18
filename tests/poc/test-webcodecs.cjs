const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  await win.loadURL('about:blank');

  const res = await win.webContents.executeJavaScript(`
    (async () => {
      const w = 1920, h = 1080;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#38bdf8';
      ctx.font = '36px monospace';
      ctx.fillText('TESTING WEBCODECS VP8 AT 1080P', 100, 200);

      const frame = new VideoFrame(canvas, { timestamp: 0 });

      let encodedChunk = null;
      let chunkMetadata = null;

      const encoder = new VideoEncoder({
        output: (chunk, meta) => {
          encodedChunk = chunk;
          chunkMetadata = meta;
        },
        error: e => console.error(e)
      });

      encoder.configure({
        codec: 'vp8',
        width: w,
        height: h,
        bitrate: 1000000,
        framerate: 30
      });

      encoder.encode(frame, { keyFrame: true });
      await encoder.flush();
      frame.close();

      let decodedFrame = null;
      const decoder = new VideoDecoder({
        output: f => { decodedFrame = f; },
        error: e => console.error(e)
      });

      decoder.configure({
        codec: 'vp8',
        codedWidth: w,
        codedHeight: h
      });

      decoder.decode(encodedChunk);
      await decoder.flush();

      const recCanvas = document.createElement('canvas');
      recCanvas.width = w;
      recCanvas.height = h;
      const recCtx = recCanvas.getContext('2d');
      recCtx.drawImage(decodedFrame, 0, 0);

      const srcData = ctx.getImageData(0, 0, w, h).data;
      const recData = recCtx.getImageData(0, 0, w, h).data;

      let sumDiff = 0;
      for (let i = 0; i < srcData.length; i += 4) {
        const dr = srcData[i] - recData[i];
        const dg = srcData[i+1] - recData[i+1];
        const db = srcData[i+2] - recData[i+2];
        sumDiff += (dr*dr + dg*dg + db*db) / 3;
      }
      const mse = sumDiff / (w * h);
      const psnr = 10 * Math.log10((255*255) / mse);

      decodedFrame.close();
      encoder.close();
      decoder.close();

      return {
        success: true,
        chunkByteLength: encodedChunk.byteLength,
        psnr: parseFloat(psnr.toFixed(2)),
        mse: parseFloat(mse.toFixed(2))
      };
    })()
  `);

  fs.writeFileSync(path.join(__dirname, 'webcodecs-test-result.json'), JSON.stringify(res, null, 2));
  app.quit();
  setTimeout(() => process.exit(0), 50);
});
