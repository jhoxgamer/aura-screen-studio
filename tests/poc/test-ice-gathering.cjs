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

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      const gathered = [];
      const types = { host: 0, srflx: 0, relay: 0 };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          const type = e.candidate.type;
          types[type] = (types[type] || 0) + 1;
          gathered.push({
            candidate: e.candidate.candidate,
            type: e.candidate.type,
            protocol: e.candidate.protocol,
            address: e.candidate.address,
            port: e.candidate.port
          });
        }
      };

      pc.createDataChannel('test');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise(r => setTimeout(r, 4000));

      return {
        gathered,
        summary: types,
        stunServers: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
        turnServerConfigured: false
      };
    })()
  `);

  console.log('ICE Gathering Results:');
  console.log('  - Host candidates:', result.summary.host);
  console.log('  - Srflx (STUN) candidates:', result.summary.srflx);
  console.log('  - Relay (TURN) candidates:', result.summary.relay);

  const outPath = path.join(__dirname, 'ice-candidates-report.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('Report saved to:', outPath);

  app.quit();
  setTimeout(() => process.exit(0), 100);
});
