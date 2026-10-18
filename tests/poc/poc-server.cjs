const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// Pure native Node.js RFC 6455 WebSocket implementation (Zero dependencies!)
class NativeWebSocket extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.readyState = 1; // OPEN
    this.buffer = Buffer.alloc(0);

    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.processBuffer();
    });

    this.socket.on('close', () => {
      this.readyState = 3; // CLOSED
      this.emit('close');
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });
  }

  processBuffer() {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < 4) return;
        payloadLen = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        // Read lower 32 bits for standard lengths
        payloadLen = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskKey = null;
      if (isMasked) {
        if (this.buffer.length < offset + 4) return;
        maskKey = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + payloadLen) return;

      let payload = this.buffer.subarray(offset, offset + payloadLen);
      this.buffer = this.buffer.subarray(offset + payloadLen);

      if (isMasked && maskKey) {
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      if (opcode === 0x08) { // CLOSE
        this.readyState = 2;
        this.socket.end();
        return;
      } else if (opcode === 0x09) { // PING
        this.sendFrame(0x0a, payload); // PONG
      } else if (opcode === 0x01) { // TEXT
        this.emit('message', payload.toString('utf-8'));
      } else if (opcode === 0x02) { // BINARY
        this.emit('message', payload);
      }
    }
  }

  send(data) {
    if (this.readyState !== 1) return;
    if (typeof data === 'string') {
      this.sendFrame(0x01, Buffer.from(data, 'utf-8'));
    } else if (Buffer.isBuffer(data)) {
      this.sendFrame(0x02, data);
    } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
      this.sendFrame(0x02, Buffer.from(data));
    }
  }

  sendFrame(opcode, payload) {
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;
      header[1] = len;
    } else if (len <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }

  close() {
    if (this.readyState === 1) {
      this.readyState = 2;
      const frame = Buffer.from([0x88, 0x00]);
      this.socket.write(frame, () => {
        this.socket.end();
      });
    }
  }
}

class PocServer {
  constructor(port = 4590) {
    this.port = port;
    this.server = null;
    this.mjpegClients = new Set();
    this.mseClients = new Set();
    this.rtcClients = new Set();
    this.latestMjpegFrame = null;
    this.mjpegBytesTotal = 0;
    this.mseBytesTotal = 0;
    this.initSegment = null;
    this.segments = [];
    this.startTime = Date.now();
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${this.port}`);

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

        if (url.pathname === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', uptime: (Date.now() - this.startTime) / 1000 }));
          return;
        }

        // MJPEG Stream endpoint (multipart/x-mixed-replace)
        if (url.pathname === '/mjpeg/stream') {
          res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Connection': 'keep-alive',
            'Pragma': 'no-cache'
          });

          this.mjpegClients.add(res);

          if (this.latestMjpegFrame) {
            this.sendMjpegFrameToClient(res, this.latestMjpegFrame);
          }

          req.on('close', () => {
            this.mjpegClients.delete(res);
          });
          return;
        }

        // MSE Init segment via HTTP GET
        if (url.pathname === '/mse/init') {
          if (!this.initSegment) {
            res.writeHead(404);
            res.end('Init segment not ready');
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'video/webm',
            'Content-Length': this.initSegment.length
          });
          res.end(this.initSegment);
          return;
        }

        // MSE media segment via HTTP GET
        if (url.pathname.startsWith('/mse/segment/')) {
          const segIdx = parseInt(url.pathname.split('/').pop(), 10);
          const seg = this.segments[segIdx];
          if (!seg) {
            res.writeHead(404);
            res.end('Segment not found');
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'video/webm',
            'Content-Length': seg.length
          });
          res.end(seg);
          return;
        }

        // Static HTML viewer
        if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/poc-viewer.html') {
          const htmlPath = path.resolve(__dirname, 'poc-viewer.html');
          if (fs.existsSync(htmlPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(fs.readFileSync(htmlPath));
            return;
          }
        }

        res.writeHead(404);
        res.end('Not Found');
      });

      // Handle WebSocket upgrades with pure native Node crypto & http
      this.server.on('upgrade', (req, socket, head) => {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
          socket.destroy();
          return;
        }

        const acceptKey = crypto
          .createHash('sha1')
          .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64');

        const responseHeaders = [
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Accept: ${acceptKey}`
        ];

        socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');
        const ws = new NativeWebSocket(socket);

        const pathname = new URL(req.url, `http://localhost:${this.port}`).pathname;
        if (pathname === '/ws/mse') {
          this.mseClients.add(ws);
          if (this.initSegment) {
            ws.send(JSON.stringify({ type: 'init-meta', size: this.initSegment.length }));
            ws.send(this.initSegment);
          }
          ws.on('close', () => {
            this.mseClients.delete(ws);
          });
        } else if (pathname === '/ws/rtc') {
          this.rtcClients.add(ws);
          ws.on('message', (msg) => {
            const data = typeof msg === 'string' ? msg : msg.toString('utf-8');
            for (const client of this.rtcClients) {
              if (client !== ws && client.readyState === 1) {
                client.send(data);
              }
            }
          });
          ws.on('close', () => {
            this.rtcClients.delete(ws);
          });
        } else {
          ws.close();
        }
      });

      this.server.listen(this.port, () => {
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  broadcastMjpeg(buffer) {
    this.latestMjpegFrame = buffer;
    for (const client of this.mjpegClients) {
      try {
        this.sendMjpegFrameToClient(client, buffer);
      } catch (err) {
        this.mjpegClients.delete(client);
      }
    }
  }

  sendMjpegFrameToClient(res, buffer) {
    res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buffer.length}\r\n\r\n`);
    res.write(buffer);
    res.write('\r\n');
    this.mjpegBytesTotal += buffer.length + 64;
  }

  setMseInitSegment(buffer) {
    this.initSegment = buffer;
    for (const ws of this.mseClients) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'init-meta', size: buffer.length }));
        ws.send(buffer);
      }
    }
  }

  broadcastMseSegment(buffer, seq) {
    this.segments.push(buffer);
    this.mseBytesTotal += buffer.length;
    for (const ws of this.mseClients) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'segment-meta', seq, size: buffer.length }));
        ws.send(buffer);
      }
    }
  }

  getMetrics() {
    return {
      mjpegViewers: this.mjpegClients.size,
      mjpegBytesTotal: this.mjpegBytesTotal,
      mseViewers: this.mseClients.size,
      mseBytesTotal: this.mseBytesTotal,
      mseSegmentsCount: this.segments.length,
      rtcViewers: this.rtcClients.size,
      uptimeSeconds: (Date.now() - this.startTime) / 1000
    };
  }

  stop() {
    return new Promise((resolve) => {
      for (const client of this.mjpegClients) {
        try { client.end(); } catch (e) {}
      }
      this.mjpegClients.clear();

      for (const ws of this.mseClients) {
        try { ws.close(); } catch (e) {}
      }
      this.mseClients.clear();

      for (const ws of this.rtcClients) {
        try { ws.close(); } catch (e) {}
      }
      this.rtcClients.clear();

      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

module.exports = PocServer;

if (require.main === module) {
  const server = new PocServer(4590);
  server.start().then(() => {
    console.log('[PocServer] Running at http://localhost:4590 (Pure Native Node.js)');
  });
}
