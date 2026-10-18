/**
 * test-tunnel-pilot.cjs
 *
 * Pilot test to verify:
 * 1. Cloudflared tunnel starts cleanly with ShareServer.
 * 2. Public URL is obtained (https://*.trycloudflare.com).
 * 3. HTTP GET to publicUrl/api/live/status succeeds.
 * 4. WebSocket upgrade to wss://<tunnel-host>/ws/mse succeeds and receives data.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const https = require('https');

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');

const { ShareServer } = require('../dist-electron/shareServer.js');

const TEST_PORT = 4789;

app.whenReady().then(async () => {
  let server = null;
  let hostWin = null;
  let spectatorWin = null;

  try {
    console.log('--- STARTING TUNNEL PILOT ---');
    server = new ShareServer(() => [], () => {});
    server.port = TEST_PORT;
    
    await server.start();
    server.startLive('Field Homologation Pilot');
    server.setLiveTransportMode('mse');
    console.log('[Pilot] ShareServer listening on local port:', TEST_PORT);

    ipcMain.on('live:push-chunk', (_, arrayBuffer) => {
      const buf = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
      if (server && server.isLiveActive()) {
        server.broadcastLiveMseChunk(buf);
      }
    });

    // Start host window
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
        let f = 0;
        setInterval(() => {
          f++;
          ctx.fillStyle = (f % 2 === 0) ? '#00bbff' : '#ff0055';
          ctx.fillRect(0, 0, 320, 240);
          ctx.fillStyle = '#fff';
          ctx.fillText('Tunnel Frame ' + f, 20, 40);
        }, 33);

        const vStream = canvas.captureStream(30);
        const aCtx = new AudioContext();
        const osc = aCtx.createOscillator();
        osc.frequency.setValueAtTime(440, aCtx.currentTime);
        const dst = aCtx.createMediaStreamDestination();
        osc.connect(dst);
        osc.start();

        const ms = new MediaStream([...vStream.getVideoTracks(), ...dst.stream.getAudioTracks()]);
        const mr = new MediaRecorder(ms, { mimeType: 'video/webm; codecs=vp8,opus' });
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
    console.log('[Pilot] Host streaming started');

    // Wait for public tunnel URL
    console.log('[Pilot] Waiting for cloudflared public tunnel URL...');
    let publicUrl = null;
    for (let i = 0; i < 30; i++) {
      publicUrl = server.getPublicUrl();
      if (publicUrl) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!publicUrl) {
      throw new Error('Timed out waiting for Cloudflare public tunnel URL');
    }
    console.log('[Pilot] Public tunnel acquired:', publicUrl);

    // Wait for DNS propagation
    const domain = new URL(publicUrl).hostname;
    console.log('[Pilot] Waiting for DNS propagation of:', domain);
    const dns = require('dns').promises;
    let resolved = false;
    for (let i = 0; i < 20; i++) {
      try {
        const addr = await dns.lookup(domain);
        console.log(`[Pilot] DNS resolved in attempt ${i}:`, addr);
        resolved = true;
        break;
      } catch (e) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (!resolved) {
      throw new Error('DNS failed to resolve for ' + domain);
    }

    // Test public HTTP GET
    console.log('[Pilot] Testing HTTPS GET to /api/live/status...');
    const statusData = await new Promise((resolve, reject) => {
      https.get(`${publicUrl}/api/live/status`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch(e) {
            resolve({ statusCode: res.statusCode, raw: data });
          }
        });
      }).on('error', reject);
    });
    console.log('[Pilot] Status response over public tunnel:', statusData);

    // Open Spectator window loading the public URL
    spectatorWin = new BrowserWindow({
      width: 1280,
      height: 720,
      show: true,
      webPreferences: {
        backgroundThrottling: false
      }
    });
    spectatorWin.focus();

    console.log('[Pilot] Loading spectator via public tunnel:', `${publicUrl}/live`);
    await spectatorWin.loadURL(`${publicUrl}/live`);

    console.log('[Pilot] Page loaded, switching to MSE if needed and observing 10 seconds...');
    await spectatorWin.webContents.executeJavaScript(`
      if (typeof switchTransport === 'function') {
        switchTransport('mse');
      }
    `);

    await new Promise(r => setTimeout(r, 10000));

    const stats = await spectatorWin.webContents.executeJavaScript(`
      (() => {
        const v = document.getElementById('liveVideo');
        return {
          currentTime: v ? v.currentTime : 0,
          paused: v ? v.paused : true,
          readyState: v ? v.readyState : 0,
          videoWidth: v ? v.videoWidth : 0,
          videoHeight: v ? v.videoHeight : 0,
          bufferedRanges: v && v.buffered ? Array.from({length: v.buffered.length}, (_, i) => [v.buffered.start(i), v.buffered.end(i)]) : [],
          mseStats: window.__mseStats || null
        };
      })()
    `);

    console.log('[Pilot] Spectator stats over public tunnel:', JSON.stringify(stats, null, 2));

    if (stats.mseStats && stats.mseStats.bytesReceived > 0 && stats.currentTime > 0) {
      console.log('>>> PILOT TEST PASSED: Public Cloudflare Tunnel MSE streaming verified! <<<');
    } else {
      console.warn('>>> PILOT TEST WARNING: Did not see bytes or currentTime advance <<<');
    }

  } catch (err) {
    console.error('[Pilot] Error during test:', err);
  } finally {
    if (spectatorWin && !spectatorWin.isDestroyed()) spectatorWin.destroy();
    if (hostWin && !hostWin.isDestroyed()) hostWin.destroy();
    if (server) server.stop();
    console.log('--- PILOT FINISHED ---');
    app.quit();
  }
});
