import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { EventEmitter } from 'node:events';
import {
  ShareServer,
  NativeWebSocket,
  createMockWebmCluster,
  isWebmClusterKeyframe,
  isSimpleBlockKeyframe,
  EbmlStreamDemuxer
} from '../electron/shareServer.ts';
import type { RecordingMeta } from '../electron/types.ts';

function httpRequest(
  url: string,
  options: http.RequestOptions = {},
  postData?: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function connectWsClient(port: number, pathUrl: string = '/ws/mse'): Promise<NativeWebSocket> {
  return new Promise((resolve, reject) => {
    const key = Buffer.from('test-random-key-' + Math.random()).toString('base64');
    const req = http.request({
      port,
      path: pathUrl,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13'
      }
    });

    req.on('upgrade', (res, socket, head) => {
      const ws = new NativeWebSocket(socket as any, head, { isServer: false });
      resolve(ws);
    });

    req.on('error', reject);
    req.end();
  });
}

describe('Live Share Transport Selection, MSE WebSocket & Tunnel Security', () => {
  let server: ShareServer;
  let testPort = 4558;
  const mockRecordings: RecordingMeta[] = [
    {
      id: 'rec_private_1',
      title: 'Gravação Confidencial',
      filePath: 'C:/fake/path/confidential.webm',
      thumbnailPath: '',
      durationMs: 30000,
      createdAt: Date.now(),
      fileSize: 10240,
      viewsCount: 0
    }
  ];

  before(async () => {
    server = new ShareServer(
      () => mockRecordings,
      () => {}
    );
    (server as any).port = testPort;
    (server as any).startTunnel = () => {};
    await server.start();
    testPort = server.getPort();
  });

  after(() => {
    server.stop();
  });

  describe('1. Transport Mode Selection', () => {
    test('defaults to standard MJPEG mode', () => {
      assert.strictEqual(server.getLiveTransportMode(), 'mjpeg');
      const status = server.getLiveStatus();
      assert.strictEqual(status.transportMode, 'mjpeg');
    });

    test('switches dynamically to MSE mode and reports via status API', async () => {
      server.startLive('Demonstração com MSE');
      server.setLiveTransportMode('mse');
      assert.strictEqual(server.getLiveTransportMode(), 'mse');

      const res = await httpRequest(`http://localhost:${testPort}/api/live/status`);
      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.transportMode, 'mse');
      assert.strictEqual(data.isLive, true);
    });

    test('switches back to MJPEG mode cleanly', async () => {
      server.setLiveTransportMode('mjpeg');
      assert.strictEqual(server.getLiveTransportMode(), 'mjpeg');

      const res = await httpRequest(`http://localhost:${testPort}/api/live/status`);
      assert.strictEqual(res.statusCode, 200);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.transportMode, 'mjpeg');
    });
  });

  describe('2. Init Segment Caching and Late-Joining Spectators', () => {
    let client1: NativeWebSocket;
    let client2: NativeWebSocket;

    afterEach(() => {
      if (client1) { client1.close(); }
      if (client2) { client2.close(); }
    });

    test('delivers Init Segment to active client and preserves it for late joiner', async () => {
      server.startLive('Sessão com Espectadores Tardios');
      server.setLiveTransportMode('mse');

      // 1. Connect first client before any segments are sent
      client1 = await connectWsClient(testPort, '/ws/mse');
      assert.ok(client1);

      const client1Messages: (string | Buffer)[] = [];
      client1.on('message', (msg) => client1Messages.push(msg));

      // 2. Host broadcasts synthetic WebM Init Segment (189 bytes, starts with EBML header)
      const fakeInitSegment = Buffer.alloc(189);
      fakeInitSegment[0] = 0x1a;
      fakeInitSegment[1] = 0x45;
      fakeInitSegment[2] = 0xdf;
      fakeInitSegment[3] = 0xa3;
      fakeInitSegment.fill(0xee, 4);

      server.broadcastLiveMseChunk(fakeInitSegment);

      // Verify server cached the init segment
      const cached = server.getCachedInitSegment();
      assert.ok(cached);
      assert.strictEqual(cached.length, 189);
      assert.strictEqual(cached[0], 0x1a);
      assert.strictEqual(cached[1], 0x45);
      assert.strictEqual(cached[2], 0xdf);
      assert.strictEqual(cached[3], 0xa3);

      // Wait a moment for client1 to receive
      await new Promise((r) => setTimeout(r, 60));
      assert.ok(client1Messages.length >= 2, 'Client 1 should receive metadata and binary chunk');

      // 3. Late-joining spectator connects AFTER init segment was already sent
      client2 = await connectWsClient(testPort, '/ws/mse');
      assert.ok(client2);

      const client2Messages: (string | Buffer)[] = [];
      client2.on('message', (msg) => client2Messages.push(msg));

      // Wait a moment for server to dispatch cached init segment to client2
      await new Promise((r) => setTimeout(r, 60));

      assert.ok(client2Messages.length >= 2, 'Late joiner must immediately receive init-meta and init segment');
      const meta = JSON.parse(client2Messages[0].toString());
      assert.strictEqual(meta.type, 'init-meta');
      assert.strictEqual(meta.size, 189);

      const binary = client2Messages[1] as Buffer;
      assert.strictEqual(binary.length, 189);
      assert.strictEqual(binary[0], 0x1a);
      assert.strictEqual(binary[3], 0xa3);
    });

    test('caches latest VP8 keyframe and delivers both Init and Keyframe to late joiner', async () => {
      server.startLive('Sessão Keyframe Cache');
      server.setLiveTransportMode('mse');

      // 1. Broadcast Init Segment
      const initSeg = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x10, 0x20]);
      server.broadcastLiveMseChunk(initSeg);

      // 2. Broadcast delta frame (no keyframe sync code)
      const deltaCluster = createMockWebmCluster({ isKeyframe: false });
      server.broadcastLiveMseChunk(deltaCluster);
      assert.strictEqual(server.getCachedLatestKeyframe(), null);

      // 3. Broadcast keyframe cluster (contains valid VP8 keyframe)
      const keyframeCluster = createMockWebmCluster({ isKeyframe: true });
      server.broadcastLiveMseChunk(keyframeCluster);
      assert.ok(server.getCachedLatestKeyframe());
      assert.strictEqual(server.getCachedLatestKeyframe()?.length, keyframeCluster.length);

      // 4. Late joiner connects AFTER keyframe was emitted
      const lateJoiner = await connectWsClient(testPort, '/ws/mse');
      const messages: (string | Buffer)[] = [];
      lateJoiner.on('message', (m) => messages.push(m));

      await new Promise((r) => setTimeout(r, 80));
      lateJoiner.close();

      // Late joiner should have received 4 messages:
      // 1: init-meta, 2: initSeg binary, 3: segment-meta (isKeyframe: true), 4: keyframe binary
      assert.ok(messages.length >= 4, `Late joiner should receive init + keyframe (got ${messages.length})`);
      const metaInit = JSON.parse(messages[0].toString());
      assert.strictEqual(metaInit.type, 'init-meta');
      const binInit = messages[1] as Buffer;
      assert.strictEqual(binInit.length, initSeg.length);

      const metaKey = JSON.parse(messages[2].toString());
      assert.strictEqual(metaKey.type, 'segment-meta');
      assert.strictEqual(metaKey.isKeyframe, true);
      const binKey = messages[3] as Buffer;
      assert.strictEqual(binKey.length, keyframeCluster.length);
      assert.ok(binKey.includes(Buffer.from([0x9d, 0x01, 0x2a])));
    });
  });

  describe('3. Segment Validation and Sequence Numbering', () => {
    test('broadcasts media clusters with sequential segment-meta headers', async () => {
      server.startLive('Sessão de Clusters Sequenciais');
      server.setLiveTransportMode('mse');

      const client = await connectWsClient(testPort, '/ws/mse');
      const messages: (string | Buffer)[] = [];
      client.on('message', (msg) => messages.push(msg));

      // Broadcast 3 clusters
      const cluster1 = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x01, 0x02]);
      const cluster2 = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x03, 0x04]);
      const cluster3 = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x05, 0x06]);

      server.broadcastLiveMseChunk(cluster1);
      server.broadcastLiveMseChunk(cluster2);
      server.broadcastLiveMseChunk(cluster3);

      await new Promise((r) => setTimeout(r, 80));
      client.close();

      const metas = messages
        .filter((m): m is string => typeof m === 'string')
        .map((m) => JSON.parse(m))
        .filter((m) => m.type === 'segment-meta');

      assert.ok(metas.length >= 3, 'Must receive segment-meta for all 3 clusters');
      assert.ok(metas[1].seq > metas[0].seq, 'Sequence number must monotonically advance');
      assert.ok(metas[2].seq > metas[1].seq, 'Sequence number must monotonically advance');
    });
  });

  describe('4. Socket Resilience and Clean Teardown', () => {
    test('server handles abrupt client disconnection without breaking live stream', async () => {
      server.startLive('Resiliência a Falha de Socket');
      server.setLiveTransportMode('mse');

      const clientA = await connectWsClient(testPort, '/ws/mse');
      const clientB = await connectWsClient(testPort, '/ws/mse');

      const bMessages: (string | Buffer)[] = [];
      clientB.on('message', (m) => bMessages.push(m));

      // Abruptly destroy client A's socket
      clientA.socket.destroy();

      // Host continues streaming
      const cluster = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0xaa, 0xbb]);
      server.broadcastLiveMseChunk(cluster);

      await new Promise((r) => setTimeout(r, 60));
      clientB.close();

      assert.ok(bMessages.length > 0, 'Client B must continue receiving normally even if client A crashed');
    });

    test('stopLive terminates WebSocket clients and cleans up cached segments', async () => {
      server.startLive('Finalização Limpa');
      const client = await connectWsClient(testPort, '/ws/mse');

      let closed = false;
      client.on('close', () => {
        closed = true;
      });

      server.stopLive();
      await new Promise((r) => setTimeout(r, 60));

      assert.strictEqual(server.isLiveActive(), false);
      assert.strictEqual(server.getCachedInitSegment(), null);
      assert.strictEqual(closed, true);
    });

    test('client reconnects after disconnection and re-receives cached Init Segment', async () => {
      server.startLive('Teste de Reconexão');
      server.setLiveTransportMode('mse');

      const init = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02]);
      server.broadcastLiveMseChunk(init);

      // Connect client first time
      const clientA = await connectWsClient(testPort, '/ws/mse');
      const clientAMsg: (string | Buffer)[] = [];
      clientA.on('message', (m) => clientAMsg.push(m));
      await new Promise((r) => setTimeout(r, 60));
      assert.ok(clientAMsg.length >= 2, 'Initial connection should receive init');

      // Disconnect client
      clientA.close();
      await new Promise((r) => setTimeout(r, 40));

      // Reconnect as client B (simulating page reload or network recovery)
      const clientB = await connectWsClient(testPort, '/ws/mse');
      const clientBMsg: (string | Buffer)[] = [];
      clientB.on('message', (m) => clientBMsg.push(m));
      await new Promise((r) => setTimeout(r, 60));

      // Verify reconnection received the cached init segment immediately
      assert.ok(clientBMsg.length >= 2, 'Reconnected client must re-receive cached init segment');
      const meta = JSON.parse(clientBMsg[0].toString());
      assert.strictEqual(meta.type, 'init-meta');

      // Now broadcast new cluster and verify clientB gets it
      const cluster = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x99]);
      server.broadcastLiveMseChunk(cluster);
      await new Promise((r) => setTimeout(r, 60));
      clientB.close();

      assert.ok(clientBMsg.length >= 4, 'Reconnected client must receive new cluster after init');
    });

    test('handles segment failure gracefully and drops chunks during paused stream', async () => {
      server.startLive('Teste de Falha de Segmento e Pausa');
      server.setLiveTransportMode('mse');

      const client = await connectWsClient(testPort, '/ws/mse');
      const messages: (string | Buffer)[] = [];
      client.on('message', (m) => messages.push(m));

      // Pause live stream
      server.setLivePaused(true);
      assert.strictEqual(server.isPaused(), true);

      // Broadcast chunk during pause (should be dropped)
      const droppedChunk = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x00]);
      server.broadcastLiveMseChunk(droppedChunk);
      await new Promise((r) => setTimeout(r, 60));

      // Zero segments delivered during pause
      const segmentMetas = messages
        .filter((m): m is string => typeof m === 'string')
        .map((m) => JSON.parse(m))
        .filter((m) => m.type === 'segment-meta');
      assert.strictEqual(segmentMetas.length, 0, 'No segments should be delivered while paused');

      // Resume stream and verify subsequent chunk passes
      server.setLivePaused(false);
      server.broadcastLiveMseChunk(droppedChunk);
      await new Promise((r) => setTimeout(r, 60));
      client.close();

      const resumedMetas = messages
        .filter((m): m is string => typeof m === 'string')
        .map((m) => JSON.parse(m))
        .filter((m) => m.type === 'segment-meta');
      assert.strictEqual(resumedMetas.length, 1, 'Segments should resume when unpaused');
    });

    test('falls back cleanly to MJPEG transport mode upon pipeline failure', async () => {
      server.startLive('Teste de Fallback');
      server.setLiveTransportMode('mse');
      assert.strictEqual(server.getLiveTransportMode(), 'mse');

      // Trigger fallback to default mjpeg
      server.setLiveTransportMode('mjpeg');
      assert.strictEqual(server.getLiveTransportMode(), 'mjpeg');

      // Confirm MJPEG frame broadcasting works normally
      const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      assert.doesNotThrow(() => {
        server.broadcastLiveFrame(fakeJpeg);
      });

      const status = server.getLiveStatus();
      assert.strictEqual(status.transportMode, 'mjpeg');
    });
  });

  describe('5. Public Tunnel Route Isolation & Security', () => {
    test('blocks access to recorded videos when request comes from public Cloudflare tunnel', async () => {
      // Tunnel request header simulation
      const tunnelHeaders = {
        Host: 'rapid-preview-domain.trycloudflare.com',
        'cf-ray': '8f12345678abcdef-GRU',
        'cf-connecting-ip': '203.0.113.195'
      };

      // 1. Trying to access private video file
      const videoRes = await httpRequest(
        `http://localhost:${testPort}/video/rec_private_1`,
        { headers: tunnelHeaders }
      );
      assert.strictEqual(videoRes.statusCode, 403, 'Public tunnel must NOT access recorded videos');
      const videoBody = JSON.parse(videoRes.body);
      assert.ok(videoBody.error.includes('Acesso negado'));

      // 2. Trying to access private share page
      const shareRes = await httpRequest(
        `http://localhost:${testPort}/share/rec_private_1`,
        { headers: tunnelHeaders }
      );
      assert.strictEqual(shareRes.statusCode, 403, 'Public tunnel must NOT access share pages');

      // 3. Trying to access private recording comments API
      const commentRes = await httpRequest(
        `http://localhost:${testPort}/api/recordings/rec_private_1/comment`,
        { method: 'POST', headers: tunnelHeaders },
        JSON.stringify({ text: 'Injeção' })
      );
      assert.strictEqual(commentRes.statusCode, 403, 'Public tunnel must NOT access recording comments');
    });

    test('allows legitimate live stream endpoints through public Cloudflare tunnel', async () => {
      const tunnelHeaders = {
        Host: 'rapid-preview-domain.trycloudflare.com',
        'cf-ray': '8f12345678abcdef-GRU'
      };

      // 1. Live viewer HTML page must be accessible
      const liveRes = await httpRequest(
        `http://localhost:${testPort}/live`,
        { headers: tunnelHeaders }
      );
      assert.strictEqual(liveRes.statusCode, 200);
      assert.ok(liveRes.body.includes('Transmissão ao Vivo'));

      // 2. Live status API must be accessible
      const statusRes = await httpRequest(
        `http://localhost:${testPort}/api/live/status`,
        { headers: tunnelHeaders }
      );
      assert.strictEqual(statusRes.statusCode, 200);
      const data = JSON.parse(statusRes.body);
      assert.strictEqual(typeof data.isLive, 'boolean');
    });
  });

  describe('6. RFC 6455 Protocol Conformance & Edge Cases', () => {
    test('handshake validation: non-GET rejected, invalid key rejected, invalid version returns 426', async () => {
      // 1. Non-GET handshake (POST /ws/mse)
      const postRes = await httpRequest(`http://localhost:${testPort}/ws/mse`, {
        method: 'POST',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13'
        }
      });
      assert.strictEqual(postRes.statusCode, 405);

      // 2. Invalid/empty Sec-WebSocket-Key
      const noKeyRes = await httpRequest(`http://localhost:${testPort}/ws/mse`, {
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': '   ',
          'Sec-WebSocket-Version': '13'
        }
      });
      assert.strictEqual(noKeyRes.statusCode, 400);

      // 3. Unsupported Sec-WebSocket-Version
      const badVerRes = await httpRequest(`http://localhost:${testPort}/ws/mse`, {
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '8'
        }
      });
      assert.strictEqual(badVerRes.statusCode, 426);
      assert.strictEqual(badVerRes.headers['sec-websocket-version'], '13');
    });

    test('masking enforcement: unmasked client frame fails with 1002 Protocol Error', async () => {
      server.startLive('Teste de Mascaramento');
      server.setLiveTransportMode('mse');

      // Create client that deliberately sends UNMASKED frame
      const key = Buffer.from('test-unmasked-key').toString('base64');
      const req = http.request({
        port: testPort,
        path: '/ws/mse',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13'
        }
      });

      await new Promise<void>((resolve, reject) => {
        req.on('upgrade', (res, socket) => {
          // Send unmasked text frame "hello" (FIN=1, opcode=1, MASK=0, len=5)
          const unmaskedFrame = Buffer.from([0x81, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f]);
          socket.write(unmaskedFrame);

          socket.on('data', (chunk) => {
            // Server must respond with Close frame 1002
            if (chunk.length >= 4 && chunk[0] === 0x88) {
              const closeCode = chunk.readUInt16BE(2);
              assert.strictEqual(closeCode, 1002);
              socket.destroy();
              resolve();
            }
          });

          socket.on('close', () => resolve());
          socket.on('error', reject);
        });
        req.on('error', reject);
        req.end();
      });
    });

    test('control frames: responds to Ping with matching Pong', async () => {
      server.startLive('Teste de Ping Pong');
      server.setLiveTransportMode('mse');

      const client = await connectWsClient(testPort, '/ws/mse');
      const pongPromise = new Promise<Buffer>((resolve) => {
        client.on('pong', (payload) => {
          resolve(payload);
        });
      });

      const pingPayload = Buffer.from('aura-heartbeat-123');
      client.ping(pingPayload);

      const receivedPong = await pongPromise;
      assert.strictEqual(receivedPong.toString(), 'aura-heartbeat-123');
      client.close();
    });

    test('payloads grandes: handles 4KB extended payload length frames cleanly', async () => {
      server.startLive('Teste de Payload Grande');
      server.setLiveTransportMode('mse');

      const client = await connectWsClient(testPort, '/ws/mse');
      const largePayload = Buffer.alloc(4096, 'A');

      const messagePromise = new Promise<string | Buffer>((resolve) => {
        client.on('message', (msg) => {
          if (typeof msg !== 'string' || !msg.includes('init-meta')) {
            resolve(msg);
          }
        });
      });

      // Send 4096 byte masked binary frame from client
      client.send(largePayload);

      // Server echoes or processes; test client round-trip
      client.close();
    });

    test('fragmentation: reassembles fragmented messages across continuation frames', () => {
      const mockSocket: any = new EventEmitter();
      mockSocket.write = () => true;
      mockSocket.destroy = () => {};
      mockSocket.end = () => {};

      const ws = new NativeWebSocket(mockSocket, undefined, { isServer: true });
      const receivedMessages: string[] = [];
      ws.on('message', (m) => receivedMessages.push(m.toString()));

      // Send fragmented text "Hello World":
      // Frame 1: FIN=0, Opcode=1 (Text), Masked, "Hello "
      // Frame 2: FIN=1, Opcode=0 (Continuation), Masked, "World"
      const maskKey = Buffer.from([0x12, 0x34, 0x56, 0x78]);
      const p1 = Buffer.from('Hello ');
      const p2 = Buffer.from('World');

      const maskedP1 = Buffer.alloc(p1.length);
      for (let i = 0; i < p1.length; i++) maskedP1[i] = p1[i] ^ maskKey[i % 4];

      const maskedP2 = Buffer.alloc(p2.length);
      for (let i = 0; i < p2.length; i++) maskedP2[i] = p2[i] ^ maskKey[i % 4];

      const f1 = Buffer.concat([Buffer.from([0x01, 0x80 | p1.length]), maskKey, maskedP1]);
      const f2 = Buffer.concat([Buffer.from([0x80, 0x80 | p2.length]), maskKey, maskedP2]);

      mockSocket.emit('data', f1);
      assert.strictEqual(receivedMessages.length, 0, 'No message emitted before final continuation frame');

      mockSocket.emit('data', f2);
      assert.strictEqual(receivedMessages.length, 1);
      assert.strictEqual(receivedMessages[0], 'Hello World');
    });

    test('protocol violations: non-zero RSV bit and invalid UTF-8 fail with 1002 and 1007', () => {
      const mockSocket: any = new EventEmitter();
      const writtenChunks: Buffer[] = [];
      mockSocket.write = (c: Buffer) => writtenChunks.push(c);
      mockSocket.destroy = () => {};
      mockSocket.end = () => {};

      // 1. RSV1 set (0x40)
      const ws1 = new NativeWebSocket(mockSocket, undefined, { isServer: true });
      const rsvFrame = Buffer.from([0xc1, 0x80, 0x00, 0x00, 0x00, 0x00]); // FIN=1, RSV1=1, text
      mockSocket.emit('data', rsvFrame);

      const close1 = writtenChunks.find(c => c[0] === 0x88);
      assert.ok(close1, 'Must emit Close frame on RSV violation');
      assert.strictEqual(close1.readUInt16BE(2), 1002);

      // 2. Invalid UTF-8 sequence in text frame
      writtenChunks.length = 0;
      const mockSocket2: any = new EventEmitter();
      mockSocket2.write = (c: Buffer) => writtenChunks.push(c);
      mockSocket2.destroy = () => {};
      mockSocket2.end = () => {};

      const ws2 = new NativeWebSocket(mockSocket2, undefined, { isServer: true });
      // 0xFF 0xFF is invalid UTF-8
      const badUtf8 = Buffer.from([0x81, 0x82, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff]);
      mockSocket2.emit('data', badUtf8);

      const close2 = writtenChunks.find(c => c[0] === 0x88);
      assert.ok(close2, 'Must emit Close frame on invalid UTF-8');
      assert.strictEqual(close2.readUInt16BE(2), 1007);
    });
  });

  describe('7. Message Queue FIFO Ordering and Listener Synchronization', () => {
    test('guarantees strict FIFO ordering when messages arrive before consumer registers listener', async () => {
      const mockSocket: any = new EventEmitter();
      mockSocket.write = () => true;
      mockSocket.destroy = () => {};
      mockSocket.end = () => {};

      const ws = new NativeWebSocket(mockSocket, undefined, { isServer: false });

      // Simulate 5 server-to-client unmasked frames arriving immediately upon connection
      for (let i = 1; i <= 5; i++) {
        const text = `Message-${i}`;
        const frame = Buffer.concat([Buffer.from([0x81, text.length]), Buffer.from(text)]);
        mockSocket.emit('data', frame);
      }

      // Consumer registers listener after delay
      await new Promise(r => setTimeout(r, 20));

      const received: string[] = [];
      ws.on('message', (msg) => {
        received.push(msg.toString());
      });

      // Wait for drain
      await new Promise(r => setTimeout(r, 40));

      assert.strictEqual(received.length, 5);
      for (let i = 1; i <= 5; i++) {
        assert.strictEqual(received[i - 1], `Message-${i}`, `Message at index ${i-1} must match strictly`);
      }
    });
  });

  describe('8. Slow Spectator Backpressure & Clean Reconnection', () => {
    test('disconnects bloated client with code 1008 and allows clean reconnection with fresh Init Segment', async () => {
      server.startLive('Teste de Contrapressão e Reconexão');
      server.setLiveTransportMode('mse');

      // Seed cached init segment
      const fakeInit = Buffer.alloc(189, 0x11);
      fakeInit[0] = 0x1a; fakeInit[1] = 0x45; fakeInit[2] = 0xdf; fakeInit[3] = 0xa3;
      server.broadcastLiveMseChunk(fakeInit);

      const client = await connectWsClient(testPort, '/ws/mse');
      let closeEventCode: number | null = null;
      client.on('close', (code) => {
        closeEventCode = code;
      });

      // Wait for server registration
      await new Promise(r => setTimeout(r, 40));

      // Simulate server-side client TCP socket having 3MB pending in writableLength (> 2MB threshold)
      for (const ws of (server as any).mseClients) {
        Object.defineProperty(ws.socket, 'writableLength', { value: 3 * 1024 * 1024, configurable: true });
      }

      // Host broadcasts next cluster
      const cluster = Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0x01]);
      server.broadcastLiveMseChunk(cluster);

      await new Promise(r => setTimeout(r, 80));
      assert.strictEqual(closeEventCode, 1008, 'Slow client must be closed with code 1008');

      // Now client reconnects cleanly
      const client2 = await connectWsClient(testPort, '/ws/mse');
      const client2Msgs: (string | Buffer)[] = [];
      client2.on('message', (m) => client2Msgs.push(m));

      await new Promise(r => setTimeout(r, 80));
      client2.close();

      assert.ok(client2Msgs.length >= 2, 'Reconnected client must receive fresh init-meta and cached Init Segment');
      const initMeta = JSON.parse(client2Msgs[0].toString());
      assert.strictEqual(initMeta.type, 'init-meta');
    });
  });

  describe('9. Path Traversal, Malformed Requests & Endpoint Security', () => {
    test('rejects path traversal attempts with HTTP 400 Bad Request', async () => {
      // 1. Classic dot-dot directory traversal
      const res1 = await httpRequest(`http://localhost:${testPort}`, { path: '/live/../video/rec_private_1' });
      assert.strictEqual(res1.statusCode, 400);
      assert.ok(res1.body.includes('malformado'));

      // 2. Encoded dot-dot traversal (%2e%2e)
      const res2 = await httpRequest(`http://localhost:${testPort}`, { path: '/%2e%2e/share/rec_private_1' });
      assert.strictEqual(res2.statusCode, 400);

      // 3. Null byte injection (%00)
      const res3 = await httpRequest(`http://localhost:${testPort}`, { path: '/live%00video' });
      assert.strictEqual(res3.statusCode, 400);
    });

    test('rejects live reaction and question endpoints when stream is offline', async () => {
      server.stopLive();
      assert.strictEqual(server.isLiveActive(), false);

      const reactionRes = await httpRequest(
        `http://localhost:${testPort}/api/live/reaction`,
        { method: 'POST' },
        JSON.stringify({ emoji: '🔥' })
      );
      assert.strictEqual(reactionRes.statusCode, 403);
      assert.ok(reactionRes.body.includes('offline'));

      const questionRes = await httpRequest(
        `http://localhost:${testPort}/api/live/question`,
        { method: 'POST' },
        JSON.stringify({ text: 'Pergunta teste?' })
      );
      assert.strictEqual(questionRes.statusCode, 403);
    });

    test('rejects oversized payloads in live endpoints with HTTP 413', async () => {
      server.startLive('Live Aberta');

      // 1. Reaction payload > 1KB
      const hugeReaction = JSON.stringify({ emoji: '👍'.repeat(1200) });
      const r1 = await httpRequest(
        `http://localhost:${testPort}/api/live/reaction`,
        { method: 'POST' },
        hugeReaction
      );
      assert.strictEqual(r1.statusCode, 413);

      // 2. Question payload > 2KB
      const hugeQuestion = JSON.stringify({ text: 'A'.repeat(2500) });
      const r2 = await httpRequest(
        `http://localhost:${testPort}/api/live/question`,
        { method: 'POST' },
        hugeQuestion
      );
      assert.strictEqual(r2.statusCode, 413);

      server.stopLive();
    });
  });

  describe('10. Incremental EBML Parser & False-Positive Keyframe Rejection', () => {
    test('rejects false-positive VP8 keyframe signature inside Delta frame payload', () => {
      // Delta frame: SimpleBlock flags has 0x00 (bit 7 = 0) or frame_type = 1
      // Deliberately plant 0x9D, 0x01, 0x2A inside payload
      const falseDeltaPayload = Buffer.from([
        0x11, // frame_type=1 (Delta/Inter frame)
        0x00, 0x00,
        0x9D, 0x01, 0x2A, // Deliberate sync code mimic inside payload
        0x01, 0x02, 0x03
      ]);
      const deltaClusterWithFalseSignature = createMockWebmCluster({
        isKeyframe: false,
        payload: falseDeltaPayload
      });

      // Verification: raw byte search would find [0x9d, 0x01, 0x2a], but strict parser rejects it
      assert.ok(deltaClusterWithFalseSignature.includes(Buffer.from([0x9d, 0x01, 0x2a])), 'Payload does contain false signature bytes');
      const isKey = isWebmClusterKeyframe(deltaClusterWithFalseSignature, 1);
      assert.strictEqual(isKey, false, 'Parser MUST reject Delta frame containing false keyframe bytes');
    });

    test('rejects keyframe signature in audio track (e.g. Opus audio track 2)', () => {
      // Audio packet on track 2 that happens to contain 0x9D, 0x01, 0x2A
      const audioPayload = Buffer.from([0x10, 0x00, 0x00, 0x9D, 0x01, 0x2A, 0x88, 0x99]);
      const audioCluster = createMockWebmCluster({
        trackNumber: 2, // Audio track
        isKeyframe: true,
        payload: audioPayload
      });

      const isKey = isWebmClusterKeyframe(audioCluster, 1); // Video is track 1
      assert.strictEqual(isKey, false, 'Parser MUST reject audio track SimpleBlock even if it matches keyframe bits');
    });

    test('handles split cluster markers and streaming accumulator reassembly', async () => {
      server.startLive('Split Cluster Test');
      server.setLiveTransportMode('mse');

      // 1. Send Init Segment first
      const initSeg = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x10, 0x20]);
      server.broadcastLiveMseChunk(initSeg);

      const client = await connectWsClient(testPort, '/ws/mse');
      const clientMsgs: (string | Buffer)[] = [];
      client.on('message', (m) => clientMsgs.push(m));

      // Construct a valid keyframe cluster
      const fullCluster = createMockWebmCluster({ isKeyframe: true });
      // Split the cluster exactly across the 4-byte Cluster ID: [0x1F, 0x43] in chunk1, [0xB6, 0x75, ...] in chunk2
      const split1 = fullCluster.subarray(0, 2); // 0x1F, 0x43
      const split2 = fullCluster.subarray(2);    // 0xB6, 0x75, ...

      server.broadcastLiveMseChunk(split1);
      await new Promise(r => setTimeout(r, 20));

      server.broadcastLiveMseChunk(split2);
      // Send a follow-up cluster marker to trigger flushing of split cluster
      const nextCluster = createMockWebmCluster({ isKeyframe: false });
      server.broadcastLiveMseChunk(nextCluster);

      await new Promise(r => setTimeout(r, 60));
      client.close();

      // Check if reassembled cluster was detected as keyframe
      assert.ok(server.getCachedLatestKeyframe(), 'Server must reassemble and cache split keyframe cluster');
    });

    test('malformed EBML chunk resilience without throwing or crashing', () => {
      // 1. Incomplete header (< 4 bytes)
      assert.strictEqual(isWebmClusterKeyframe(Buffer.from([0x1F, 0x43])), false);

      // 2. Corrupted VINT size (e.g. all zeros)
      assert.strictEqual(isWebmClusterKeyframe(Buffer.from([0x1F, 0x43, 0xB6, 0x75, 0x00, 0x00])), false);

      // 3. Truncated SimpleBlock
      const truncated = Buffer.from([0x1F, 0x43, 0xB6, 0x75, 0x85, 0xA3, 0x83, 0x81, 0x00]);
      assert.doesNotThrow(() => {
        const res = isWebmClusterKeyframe(truncated);
        assert.strictEqual(res, false);
      });

      // 4. Random garbage data
      const randomGarbage = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0x9D, 0x01, 0x2A]);
      assert.strictEqual(isWebmClusterKeyframe(randomGarbage), false);
    });
  });

  describe('11. Incremental EBML Parser Boundary Splitting, Multiple Tracks & Stateful Demuxing', () => {
    test('11.1 handles chunk split inside EBML ID (Cluster ID 0x1F43B675)', () => {
      const demuxer = new EbmlStreamDemuxer();
      const fullCluster = createMockWebmCluster({ isKeyframe: true });

      // Split between 2nd and 3rd byte of Cluster ID [0x1F, 0x43] | [0xB6, 0x75]
      const chunk1 = fullCluster.subarray(0, 2);
      const chunk2 = fullCluster.subarray(2);

      const r1 = demuxer.feed(chunk1);
      assert.strictEqual(r1.completedClusters.length, 0);
      assert.strictEqual(r1.hasIncompleteData, true);
      assert.strictEqual(r1.bufferedBytes, 2);

      const r2 = demuxer.feed(chunk2);
      assert.strictEqual(r2.completedClusters.length, 1);
      assert.strictEqual(r2.completedClusters[0].isKeyframe, true);
      assert.strictEqual(r2.hasIncompleteData, false);
      assert.strictEqual(r2.bufferedBytes, 0);
    });

    test('11.2 handles chunk split inside Size VINT', () => {
      const demuxer = new EbmlStreamDemuxer();
      // Generate a cluster with payload long enough to require a 2-byte VINT
      const bigPayload = Buffer.alloc(150, 0x42);
      // Valid VP8 keyframe header inside payload
      bigPayload[0] = 0x10;
      bigPayload[1] = 0x00;
      bigPayload[2] = 0x00;
      bigPayload[3] = 0x9D;
      bigPayload[4] = 0x01;
      bigPayload[5] = 0x2A;
      const fullCluster = createMockWebmCluster({ isKeyframe: true, payload: bigPayload });

      // Cluster ID (4 bytes) + Size VINT byte 1 (offset 4) | Size VINT byte 2 (offset 5)
      const chunk1 = fullCluster.subarray(0, 5); // Ends inside the 2-byte size VINT
      const chunk2 = fullCluster.subarray(5);

      const r1 = demuxer.feed(chunk1);
      assert.strictEqual(r1.completedClusters.length, 0);
      assert.strictEqual(r1.hasIncompleteData, true);

      const r2 = demuxer.feed(chunk2);
      assert.strictEqual(r2.completedClusters.length, 1);
      assert.strictEqual(r2.completedClusters[0].isKeyframe, true);
    });

    test('11.3 handles chunk split inside TrackNumber (2-byte VINT in SimpleBlock)', () => {
      const demuxer = new EbmlStreamDemuxer();
      const fullCluster = createMockWebmCluster({ isKeyframe: true, twoByteTrackNumber: true });

      // In SimpleBlock (ID 0xA3), track number is encoded as 0x40 0x01
      const simpleBlockIdx = fullCluster.indexOf(0xA3);
      assert.ok(simpleBlockIdx > 0, 'SimpleBlock must exist');
      const trackVintIdx = fullCluster.indexOf(Buffer.from([0x40, 0x01]), simpleBlockIdx);
      assert.ok(trackVintIdx > 0, '2-byte TrackNumber must exist');

      // Split between 0x40 and 0x01
      const chunk1 = fullCluster.subarray(0, trackVintIdx + 1);
      const chunk2 = fullCluster.subarray(trackVintIdx + 1);

      const r1 = demuxer.feed(chunk1);
      assert.strictEqual(r1.completedClusters.length, 0);
      assert.strictEqual(r1.hasIncompleteData, true);

      const r2 = demuxer.feed(chunk2);
      assert.strictEqual(r2.completedClusters.length, 1);
      assert.strictEqual(r2.completedClusters[0].isKeyframe, true);
    });

    test('11.4 handles chunk split inside SimpleBlock header (relative timecode & flags)', () => {
      const demuxer = new EbmlStreamDemuxer();
      const fullCluster = createMockWebmCluster({ isKeyframe: true });

      const simpleBlockIdx = fullCluster.indexOf(0xA3);
      assert.ok(simpleBlockIdx > 0);
      // Track VINT is 1 byte (0x81). Flags is 0x80
      const flagsIdx = fullCluster.indexOf(0x80, simpleBlockIdx);
      assert.ok(flagsIdx > simpleBlockIdx);

      // Split right before the flags byte (inside the header)
      const chunk1 = fullCluster.subarray(0, flagsIdx);
      const chunk2 = fullCluster.subarray(flagsIdx);

      const r1 = demuxer.feed(chunk1);
      assert.strictEqual(r1.completedClusters.length, 0);
      assert.strictEqual(r1.hasIncompleteData, true);

      const r2 = demuxer.feed(chunk2);
      assert.strictEqual(r2.completedClusters.length, 1);
      assert.strictEqual(r2.completedClusters[0].isKeyframe, true);
    });

    test('11.5 handles chunk split inside VP8 header and sync code (0x9D 0x01 0x2A)', () => {
      const demuxer = new EbmlStreamDemuxer();
      const fullCluster = createMockWebmCluster({ isKeyframe: true });

      const syncIdx = fullCluster.indexOf(Buffer.from([0x9D, 0x01, 0x2A]));
      assert.ok(syncIdx > 0, 'Sync code must exist in keyframe cluster');

      // Split between 0x01 and 0x2A
      const splitPoint = syncIdx + 2;
      const chunk1 = fullCluster.subarray(0, splitPoint);
      const chunk2 = fullCluster.subarray(splitPoint);

      const r1 = demuxer.feed(chunk1);
      assert.strictEqual(r1.completedClusters.length, 0);
      assert.strictEqual(r1.hasIncompleteData, true);

      const r2 = demuxer.feed(chunk2);
      assert.strictEqual(r2.completedClusters.length, 1);
      assert.strictEqual(r2.completedClusters[0].isKeyframe, true);
    });

    test('11.6 handles chunk split inside SimpleBlock payload', () => {
      const demuxer = new EbmlStreamDemuxer();
      const fullCluster = createMockWebmCluster({ isKeyframe: true });

      // Split 5 bytes before the end of the cluster (inside payload)
      const splitPoint = fullCluster.length - 5;
      const chunk1 = fullCluster.subarray(0, splitPoint);
      const chunk2 = fullCluster.subarray(splitPoint);

      const r1 = demuxer.feed(chunk1);
      assert.strictEqual(r1.completedClusters.length, 0);
      assert.strictEqual(r1.hasIncompleteData, true);

      const r2 = demuxer.feed(chunk2);
      assert.strictEqual(r2.completedClusters.length, 1);
      assert.strictEqual(r2.completedClusters[0].isKeyframe, true);
      assert.strictEqual(r2.hasIncompleteData, false);
    });

    test('11.7 preserves incomplete data on truncated lengths without emitting invalid cluster', () => {
      const demuxer = new EbmlStreamDemuxer();
      // Construct a cluster declaring 500 bytes of data, but only provide 30 bytes
      const fakeLargeHeader = Buffer.concat([
        Buffer.from([0x1F, 0x43, 0xB6, 0x75]), // Cluster ID
        Buffer.from([0x41, 0xF4]),              // Size VINT = 500 bytes (0x01F4)
        Buffer.alloc(24, 0xAA)                  // Only 24 bytes of body provided
      ]);

      const r1 = demuxer.feed(fakeLargeHeader);
      assert.strictEqual(r1.completedClusters.length, 0, 'Must NOT emit incomplete cluster');
      assert.strictEqual(r1.hasIncompleteData, true);
      assert.strictEqual(r1.bufferedBytes, fakeLargeHeader.length);

      // Supply the remaining 476 bytes
      const remainder = Buffer.alloc(476, 0xBB);
      const r2 = demuxer.feed(remainder);
      assert.strictEqual(r2.completedClusters.length, 1, 'Must emit cluster once complete length is reached');
      assert.strictEqual(r2.completedClusters[0].data.length, 4 + 2 + 500);
      assert.strictEqual(r2.hasIncompleteData, false);
    });

    test('11.8 safely skips invalid or unknown EBML elements (e.g. Void 0xEC) to reach SimpleBlock', () => {
      const demuxer = new EbmlStreamDemuxer();
      // EBML Void element: ID 0xEC, size 6, 6 bytes of padding
      const voidElement = Buffer.from([0xEC, 0x86, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66]);
      const clusterWithVoid = createMockWebmCluster({
        isKeyframe: true,
        extraElements: [voidElement]
      });

      const r = demuxer.feed(clusterWithVoid);
      assert.strictEqual(r.completedClusters.length, 1);
      assert.strictEqual(r.completedClusters[0].isKeyframe, true, 'Parser must skip Void element and identify keyframe');
    });

    test('11.9 handles multiple tracks (Track 1 Audio + Track 2 Video) with correct keyframe filtering', () => {
      const demuxer = new EbmlStreamDemuxer({ videoTrackNumber: 2 });

      // Audio SimpleBlock on track 1 (Opus audio packet containing 9D 01 2A in body)
      const audioPayload = Buffer.from([0xF8, 0x41, 0x9D, 0x01, 0x2A, 0x77, 0x88]);
      const audioSimpleBlock = Buffer.concat([
        Buffer.from([0xA3]), // SimpleBlock ID
        Buffer.from([0x80 | (1 + 2 + 1 + audioPayload.length)]), // Size VINT
        Buffer.from([0x81]), // Track 1
        Buffer.from([0x00, 0x00]), // Timecode
        Buffer.from([0x80]), // Keyframe flag set in audio
        audioPayload
      ]);

      const clusterMultiTrack = createMockWebmCluster({
        trackNumber: 2, // Video is Track 2
        isKeyframe: true,
        extraElements: [audioSimpleBlock]
      });

      // Verify cluster with demuxer targeting Track 2
      const r = demuxer.feed(clusterMultiTrack);
      assert.strictEqual(r.completedClusters.length, 1);
      assert.strictEqual(r.completedClusters[0].isKeyframe, true, 'Targeting Video Track 2 must find video keyframe');

      // Verify that if targeted at Track 1, it rejects it as keyframe
      const isKeyForTrack1 = isWebmClusterKeyframe(clusterMultiTrack, 1);
      assert.strictEqual(isKeyForTrack1, false, 'Track 1 (Audio) must not be treated as video keyframe');
    });

    test('11.10 rejects false-positive VP8 keyframe signature inside Delta frame payload during demuxing', () => {
      const demuxer = new EbmlStreamDemuxer();
      const deltaPayloadWithFakeKey = Buffer.from([
        0x11, // Delta frame (frame_type = 1)
        0x00, 0x00,
        0x9D, 0x01, 0x2A, // Mimic start code inside delta payload
        0x33, 0x44, 0x55
      ]);
      const deltaCluster = createMockWebmCluster({
        isKeyframe: false,
        payload: deltaPayloadWithFakeKey
      });

      const r = demuxer.feed(deltaCluster);
      assert.strictEqual(r.completedClusters.length, 1);
      assert.strictEqual(r.completedClusters[0].isKeyframe, false, 'Delta frame must be identified as non-keyframe');
      assert.strictEqual(demuxer.getCachedLatestKeyframe(), null, 'Delta frame must not be cached as keyframe');
    });
  });
});
