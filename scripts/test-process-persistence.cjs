const { app, BrowserWindow } = require('electron');
const path = require('path');

const phase = process.argv[2]; // 'write' or 'read'

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: 'persist:aura-qa-test', // Dedicated persisted partition
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  const distHtml = path.resolve(__dirname, '../dist/index.html');
  await win.loadFile(distHtml);

  if (phase === 'write') {
    await win.webContents.executeJavaScript(`
      localStorage.setItem('aura_recording_mode', 'cam-only');
      localStorage.setItem('aura_resolution', '720p');
      localStorage.setItem('aura_mic_volume', '185');
      localStorage.setItem('aura_noise_suppression', 'high');
    `);
    console.log('[PROCESS_WRITE] Settings written to persistent storage in PID:', process.pid);
    win.destroy();
    app.quit();
    process.exit(0);
  } else if (phase === 'read') {
    const result = await win.webContents.executeJavaScript(`
      ({
        mode: localStorage.getItem('aura_recording_mode'),
        res: localStorage.getItem('aura_resolution'),
        vol: localStorage.getItem('aura_mic_volume'),
        noise: localStorage.getItem('aura_noise_suppression')
      })
    `);
    console.log('[PROCESS_READ] Settings read from persistent storage in PID:', process.pid);
    console.log('RESULT_DATA:', JSON.stringify(result));
    const passed = result.mode === 'cam-only' && result.res === '720p' && result.vol === '185' && result.noise === 'high';
    win.destroy();
    app.quit();
    process.exit(passed ? 0 : 1);
  }
});
