const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  await win.loadURL('about:blank');

  const report = await win.webContents.executeJavaScript(`
    (async () => {
      const rep = {
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        nodeVersion: process.versions.node,
        v8Version: process.versions.v8,
        mediaSourceSupported: typeof MediaSource !== 'undefined',
        mseTypes: {},
        webCodecsSupported: typeof VideoEncoder !== 'undefined',
        videoEncoderConfigs: {},
        audioEncoderConfigs: {},
        webrtcSupported: typeof RTCPeerConnection !== 'undefined',
        webrtcCodecs: { video: [], audio: [] }
      };

      if (rep.mediaSourceSupported) {
        const typesToCheck = [
          'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
          'video/mp4; codecs="avc1.640028, mp4a.40.2"',
          'video/mp4; codecs="avc1.4d401f"',
          'video/webm; codecs="vp8, opus"',
          'video/webm; codecs="vp9, opus"',
          'video/webm; codecs="vp8"',
          'video/webm; codecs="vp9"',
          'video/webm; codecs="av1, opus"',
          'video/mp4; codecs="av01.0.08M.08, opus"'
        ];
        for (const t of typesToCheck) {
          rep.mseTypes[t] = MediaSource.isTypeSupported(t);
        }
      }

      if (rep.webCodecsSupported) {
        const vConfigs = [
          { name: 'H.264 Baseline 720p', config: { codec: 'avc1.42001f', width: 1280, height: 720, bitrate: 2000000, framerate: 30 } },
          { name: 'H.264 High 1080p', config: { codec: 'avc1.640028', width: 1920, height: 1080, bitrate: 4000000, framerate: 60 } },
          { name: 'VP8 1080p', config: { codec: 'vp8', width: 1920, height: 1080, bitrate: 4000000, framerate: 60 } },
          { name: 'VP9 Profile 0 1080p', config: { codec: 'vp09.00.10.08', width: 1920, height: 1080, bitrate: 4000000, framerate: 60 } },
          { name: 'AV1 Main 1080p', config: { codec: 'av01.0.08M.08', width: 1920, height: 1080, bitrate: 3000000, framerate: 60 } }
        ];
        for (const vc of vConfigs) {
          try {
            const res = await VideoEncoder.isConfigSupported(vc.config);
            rep.videoEncoderConfigs[vc.name] = res.supported;
          } catch (e) {
            rep.videoEncoderConfigs[vc.name] = false;
          }
        }

        const aConfigs = [
          { name: 'Opus 48kHz Stereo', config: { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 } },
          { name: 'AAC LC 44.1kHz Stereo', config: { codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 128000 } }
        ];
        for (const ac of aConfigs) {
          try {
            const res = await AudioEncoder.isConfigSupported(ac.config);
            rep.audioEncoderConfigs[ac.name] = res.supported;
          } catch (e) {
            rep.audioEncoderConfigs[ac.name] = false;
          }
        }
      }

      if (rep.webrtcSupported && typeof RTCRtpSender.getCapabilities === 'function') {
        const vCaps = RTCRtpSender.getCapabilities('video');
        if (vCaps && vCaps.codecs) {
          rep.webrtcCodecs.video = vCaps.codecs.map(c => c.mimeType + (c.sdpFmtpLine ? ' (' + c.sdpFmtpLine + ')' : ''));
        }
        const aCaps = RTCRtpSender.getCapabilities('audio');
        if (aCaps && aCaps.codecs) {
          rep.webrtcCodecs.audio = aCaps.codecs.map(c => c.mimeType + (c.clockRate ? ' ' + c.clockRate + 'Hz' : ''));
        }
      }

      return rep;
    })()
  `);

  const outPath = path.resolve(__dirname, 'codec-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log('Report saved to:', outPath);

  win.destroy();
  setTimeout(() => {
    app.quit();
    process.exit(0);
  }, 100);
});
