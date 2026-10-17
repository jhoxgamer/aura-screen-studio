import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import type { RecordingMeta, VideoComment, VideoReaction } from './types.ts';

export class ShareServer {
  private server: http.Server | null = null;
  private port: number = 4545;
  private localIp: string = 'localhost';
  private getMetadata: () => RecordingMeta[];
  private saveMetadata: (list: RecordingMeta[]) => void;
  private tunnelProcess: ChildProcess | null = null;
  private publicTunnelUrl: string | null = null;

  // Zoom-Style Live Screen Sharing State
  private isLive: boolean = false;
  private isLivePaused: boolean = false;
  private liveTitle: string = 'Apresentação ao Vivo';
  private liveStartTime: number = 0;
  private activeLiveClients: Set<http.ServerResponse> = new Set();
  private liveEventClients: Set<http.ServerResponse> = new Set();
  private latestLiveJpeg: Buffer | null = null;
  private latestLiveTimestamp: number = 0;
  public onLiveReaction?: (reaction: { emoji: string; author?: string; time: number }) => void;
  public onLiveViewersChanged?: (count: number) => void;
  public onLiveQuestion?: (question: { text: string; author?: string; time: number }) => void;

  constructor(getMetadata: () => RecordingMeta[], saveMetadata: (list: RecordingMeta[]) => void) {
    this.getMetadata = getMetadata;
    this.saveMetadata = saveMetadata;
    this.localIp = this.detectLocalIp();
  }

  private detectLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }

  public getPublicUrl(): string | null {
    return this.publicTunnelUrl;
  }

  public getShareUrl(id: string): string {
    if (this.publicTunnelUrl) {
      return `${this.publicTunnelUrl}/share/${id}`;
    }
    return `http://${this.localIp}:${this.port}/share/${id}`;
  }

  public getLocalShareUrl(id: string): string {
    return `http://localhost:${this.port}/share/${id}`;
  }

  public getPort(): number {
    return this.port;
  }

  // Live Screen Sharing Management
  public startLive(title: string = 'Apresentação ao Vivo') {
    this.isLive = true;
    this.isLivePaused = false;
    this.liveTitle = title;
    this.liveStartTime = Date.now();
    this.broadcastLiveEvent({ type: 'status', status: this.getLiveStatus() });
    return this.getLiveUrls();
  }

  public stopLive() {
    this.isLive = false;
    this.isLivePaused = false;
    this.broadcastLiveEvent({ type: 'status', status: this.getLiveStatus() });
    for (const client of this.activeLiveClients) {
      try {
        client.end();
      } catch (e) {}
    }
    this.activeLiveClients.clear();
    this.notifyViewersChanged();
  }

  public setLivePaused(paused: boolean) {
    this.isLivePaused = paused;
    this.broadcastLiveEvent({ type: 'status', status: this.getLiveStatus() });
  }

  public isLiveActive(): boolean {
    return this.isLive;
  }

  public isPaused(): boolean {
    return this.isLivePaused;
  }

  public getLiveViewersCount(): number {
    return this.activeLiveClients.size;
  }

  public getLiveUrl(): string {
    if (this.publicTunnelUrl) {
      return `${this.publicTunnelUrl}/live`;
    }
    return `http://${this.localIp}:${this.port}/live`;
  }

  public getLiveUrls() {
    return {
      networkUrl: `http://${this.localIp}:${this.port}/live`,
      localUrl: `http://localhost:${this.port}/live`,
      publicUrl: this.publicTunnelUrl ? `${this.publicTunnelUrl}/live` : null
    };
  }

  public getLiveStatus() {
    return {
      isLive: this.isLive,
      isPaused: this.isLivePaused,
      viewers: this.activeLiveClients.size,
      title: this.liveTitle,
      uptime: this.isLive ? Math.floor((Date.now() - this.liveStartTime) / 1000) : 0,
      url: this.getLiveUrl(),
      urls: this.getLiveUrls()
    };
  }

  public broadcastLiveFrame(jpegBuffer: Buffer) {
    if (!this.isLive) return;
    this.latestLiveJpeg = jpegBuffer;
    this.latestLiveTimestamp = Date.now();

    if (this.isLivePaused) return;

    for (const client of this.activeLiveClients) {
      try {
        this.writeFrameToClient(client, jpegBuffer);
      } catch (err) {
        this.activeLiveClients.delete(client);
      }
    }
  }

  private writeFrameToClient(res: http.ServerResponse, buffer: Buffer) {
    res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buffer.length}\r\n\r\n`);
    res.write(buffer);
    res.write('\r\n');
  }

  private notifyViewersChanged() {
    const count = this.activeLiveClients.size;
    this.broadcastLiveEvent({ type: 'viewers', count });
    if (this.onLiveViewersChanged) {
      this.onLiveViewersChanged(count);
    }
  }

  private broadcastLiveEvent(event: any) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.liveEventClients) {
      try {
        client.write(payload);
      } catch (e) {
        this.liveEventClients.delete(client);
      }
    }
  }

  public start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, () => {
        console.log(`[Aura Share Server] Running locally at http://${this.localIp}:${this.port}`);
        this.startTunnel();
        resolve(this.port);
      });

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          this.port += 1;
          this.server?.listen(this.port);
        } else {
          console.error('[Aura Share Server] Error:', err);
        }
      });
    });
  }

  private startTunnel() {
    const binPathCandidates = [
      path.join(process.resourcesPath || '', 'cloudflared.exe'),
      path.join(process.resourcesPath || '', 'bin', 'cloudflared.exe'),
      path.resolve(__dirname, '../../bin/cloudflared.exe'),
      path.resolve(__dirname, '../bin/cloudflared.exe'),
      path.resolve(process.cwd(), 'bin/cloudflared.exe'),
      'cloudflared.exe',
      'cloudflared'
    ];

    let chosenBin = '';
    for (const p of binPathCandidates) {
      if (fs.existsSync(p)) {
        chosenBin = p;
        break;
      }
    }

    if (!chosenBin) {
      console.warn('[Aura Cloudflare Tunnel] cloudflared.exe not found. Running local-only mode.');
      return;
    }

    try {
      console.log(`[Aura Cloudflare Tunnel] Launching public tunnel using ${chosenBin} for port ${this.port}...`);
      this.tunnelProcess = spawn(chosenBin, ['tunnel', '--url', `http://localhost:${this.port}`], {
        windowsHide: true
      });

      const handleData = (chunk: Buffer) => {
        const text = chunk.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !this.publicTunnelUrl) {
          this.publicTunnelUrl = match[0];
          console.log(`\n======================================================`);
          console.log(`🚀 [Aura Public Internet Link READY]`);
          console.log(`🔗 Global URL: ${this.publicTunnelUrl}`);
          console.log(`======================================================\n`);
        }
      };

      this.tunnelProcess.stdout?.on('data', handleData);
      this.tunnelProcess.stderr?.on('data', handleData);

      this.tunnelProcess.on('error', (err) => {
        console.warn('[Aura Cloudflare Tunnel] Process error:', err.message);
      });

      this.tunnelProcess.on('exit', (code) => {
        console.log('[Aura Cloudflare Tunnel] Exited with code:', code);
        this.tunnelProcess = null;
        this.publicTunnelUrl = null;
      });
    } catch (err) {
      console.warn('[Aura Cloudflare Tunnel] Failed to start:', err);
    }
  }

  public stop() {
    if (this.tunnelProcess) {
      try {
        this.tunnelProcess.kill();
      } catch (e) {}
      this.tunnelProcess = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // CORS headers for local network access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // LIVE STREAMING & SCREEN SHARE ENDPOINTS
    if (pathname === '/live' || pathname === '/live/') {
      this.renderLiveViewer(req, res);
      return;
    }

    if (pathname === '/live/stream') {
      this.handleLiveStream(req, res);
      return;
    }

    if (pathname === '/api/live/events') {
      this.handleLiveEvents(req, res);
      return;
    }

    if (pathname === '/api/live/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getLiveStatus()));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/live/reaction') {
      this.handleLiveReactionPost(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/live/question') {
      this.handleLiveQuestionPost(req, res);
      return;
    }

    // 1. Video streaming endpoint: /video/:id
    if (pathname.startsWith('/video/')) {
      const id = pathname.replace('/video/', '');
      this.streamVideo(id, req, res);
      return;
    }

    // 2. Web player page: /share/:id
    if (pathname.startsWith('/share/')) {
      const id = pathname.replace('/share/', '');
      this.renderWebPlayer(id, req, res);
      return;
    }

    // 3. API: Add Comment /api/recordings/:id/comment
    if (req.method === 'POST' && pathname.includes('/comment')) {
      const match = pathname.match(/\/api\/recordings\/([^/]+)\/comment/);
      if (match) {
        const id = match[1];
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const list = this.getMetadata();
            const target = list.find(r => r.id === id);
            if (target) {
              if (!target.comments) target.comments = [];
              const newComment: VideoComment = {
                id: `cmt_${Date.now()}`,
                author: data.author?.trim() || 'Espectador',
                time: Number(data.time) || 0,
                text: data.text?.trim() || '',
                createdAt: Date.now()
              };
              target.comments.push(newComment);
              this.saveMetadata(list);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, comment: newComment }));
              return;
            }
          } catch (e) {}
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid comment payload' }));
        });
        return;
      }
    }

    // 4. API: Add Reaction /api/recordings/:id/reaction
    if (req.method === 'POST' && pathname.includes('/reaction')) {
      const match = pathname.match(/\/api\/recordings\/([^/]+)\/reaction/);
      if (match) {
        const id = match[1];
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const list = this.getMetadata();
            const target = list.find(r => r.id === id);
            if (target) {
              if (!target.reactions) target.reactions = [];
              const newReaction: VideoReaction = {
                id: `rx_${Date.now()}`,
                emoji: data.emoji || '👍',
                time: Number(data.time) || 0,
                createdAt: Date.now()
              };
              target.reactions.push(newReaction);
              this.saveMetadata(list);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, reaction: newReaction }));
              return;
            }
          } catch (e) {}
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid reaction payload' }));
        });
        return;
      }
    }

    // 5. API: View count /api/recordings/:id/view
    if (req.method === 'POST' && pathname.includes('/view')) {
      const match = pathname.match(/\/api\/recordings\/([^/]+)\/view/);
      if (match) {
        const id = match[1];
        const list = this.getMetadata();
        const target = list.find(r => r.id === id);
        if (target) {
          target.viewsCount = (target.viewsCount || 0) + 1;
          this.saveMetadata(list);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ views: target.viewsCount }));
          return;
        }
      }
    }

    // Default: Home / Dashboard of all videos
    this.renderDashboard(res);
  }

  private streamVideo(id: string, req: http.IncomingMessage, res: http.ServerResponse) {
    const list = this.getMetadata();
    const video = list.find(r => r.id === id);

    if (!video || !fs.existsSync(video.filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Vídeo não encontrado ou arquivo excluído.');
      return;
    }

    const stat = fs.statSync(video.filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    const mime = video.filePath.endsWith('.mp4') ? 'video/mp4' : 'video/webm';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(video.filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mime
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mime,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(video.filePath).pipe(res);
    }
  }

  private renderWebPlayer(id: string, req: http.IncomingMessage, res: http.ServerResponse) {
    const list = this.getMetadata();
    const video = list.find(r => r.id === id);

    if (!video) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Vídeo não encontrado</h1>');
      return;
    }

    const title = video.title || 'Gravação Aura';
    const commentsJson = JSON.stringify(video.comments || []);
    const reactionsJson = JSON.stringify(video.reactions || []);
    const transcriptJson = JSON.stringify(video.transcript || []);
    const chaptersJson = JSON.stringify(video.chapters || []);
    const aiSummary = video.aiSummary || 'Gravação gerada pelo Aura Screen Studio com tela, câmera e áudio combinados.';
    const formattedDate = new Date(video.createdAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)} - Aura Screen</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #080a0f; color: #f1f5f9; }
    .aura-gradient { background: linear-gradient(135deg, #06b6d4 0%, #6366f1 50%, #8b5cf6 100%); }
    .floating-emoji {
      position: absolute;
      animation: floatUp 1.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
      pointer-events: none;
      font-size: 2.2rem;
      z-index: 50;
    }
    @keyframes floatUp {
      0% { transform: translateY(0) scale(0.6); opacity: 1; }
      100% { transform: translateY(-160px) scale(1.4); opacity: 0; }
    }
    /* Custom Scrubber */
    input[type=range]::-webkit-slider-thumb {
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #06b6d4;
      cursor: pointer;
      box-shadow: 0 0 12px rgba(6, 182, 212, 0.9);
    }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <!-- Top Navbar -->
  <header class="border-b border-slate-800/80 bg-[#0d111c]/95 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
    <div class="flex items-center space-x-3">
      <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-cyan-500 to-violet-500 p-0.5 shadow-lg shadow-cyan-500/20 flex items-center justify-center">
        <div class="w-full h-full bg-[#0d111c] rounded-[10px] flex items-center justify-center">
          <svg class="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" stroke="url(#hAuraGrad)" />
            <circle cx="12" cy="12" r="3.5" fill="#f43f5e" />
            <defs>
              <linearGradient id="hAuraGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#06b6d4"/>
                <stop offset="100%" stop-color="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
      <div>
        <div class="flex items-center space-x-2">
          <h1 class="text-sm font-bold text-white tracking-tight">${this.escapeHtml(title)}</h1>
          <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Aura</span>
        </div>
        <p class="text-xs text-slate-400">Gravado em ${formattedDate} • <span id="views-count">${video.viewsCount || 1}</span> visualizações</p>
      </div>
    </div>

    <div class="flex items-center space-x-2.5">
      <button onclick="copyShareLink()" class="flex items-center space-x-1.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:brightness-110 active:scale-95 text-white px-4 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-md shadow-indigo-600/30">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        <span id="copy-btn-text">Copiar Link</span>
      </button>

      <button onclick="copyEmbedCode()" class="flex items-center space-x-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors">
        <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        <span>Embed</span>
      </button>

      <a href="/video/${video.id}" download="${video.id}.webm" class="flex items-center space-x-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>Baixar</span>
      </a>
    </div>
  </header>

  <!-- Main Container -->
  <main class="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Video Player Section (Left 2 cols) -->
    <div class="lg:col-span-2 flex flex-col space-y-4">
      <div id="player-container" class="relative aspect-video bg-black rounded-2xl overflow-hidden border border-gray-800/80 shadow-2xl group flex items-center justify-center">
        <video id="main-video" class="w-full h-full object-contain cursor-pointer" playsinline preload="auto">
          <source src="/video/${video.id}" type="video/webm">
          Seu navegador não suporta a tag de vídeo.
        </video>

        <!-- Big Play Button Overlay -->
        <button id="big-play-btn" onclick="togglePlay()" class="absolute w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 via-cyan-500 to-violet-500 text-white flex items-center justify-center shadow-2xl shadow-cyan-500/30 hover:scale-110 active:scale-95 transition-all">
          <svg class="w-9 h-9 fill-current ml-1" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>

        <!-- Floating Emojis Container -->
        <div id="emoji-float-area" class="absolute inset-0 pointer-events-none overflow-hidden"></div>

        <!-- Custom Player Controls Bar -->
        <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <!-- Timeline scrubber with reaction dots and chapter marks -->
          <div class="relative mb-3 flex items-center">
            <input type="range" id="seek-bar" min="0" max="100" value="0" step="0.1" class="w-full h-1.5 bg-gray-700/80 rounded-lg cursor-pointer appearance-none">
            <div id="timeline-chapters" class="absolute inset-x-0 pointer-events-none h-1.5 z-10"></div>
            <div id="timeline-reactions" class="absolute inset-x-0 pointer-events-none h-1.5 z-20"></div>
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <button onclick="togglePlay()" id="play-pause-btn" class="text-white hover:text-cyan-400 p-1">
                <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>

              <span id="time-display" class="text-xs font-mono text-gray-300">00:00 / 00:00</span>
            </div>

            <div class="flex items-center space-x-3">
              <!-- Playback Speed -->
              <button onclick="cycleSpeed()" id="speed-btn" class="text-xs font-bold bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg text-white">1x</button>

              <!-- Fullscreen -->
              <button onclick="toggleFullscreen()" class="text-white hover:text-cyan-400 p-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Emoji Reactions Bar (Aura Interactive Timeline) -->
      <div class="bg-[#0d111c] border border-slate-800/90 rounded-2xl p-3 flex items-center justify-between shadow-md">
        <div class="flex items-center space-x-1.5">
          <span class="text-xs font-medium text-slate-400 mr-2">Reagir no segundo atual:</span>
          <button onclick="sendReaction('👍')" class="p-2 hover:bg-white/10 rounded-xl text-xl hover:scale-125 transition-all">👍</button>
          <button onclick="sendReaction('❤️')" class="p-2 hover:bg-white/10 rounded-xl text-xl hover:scale-125 transition-all">❤️</button>
          <button onclick="sendReaction('👏')" class="p-2 hover:bg-white/10 rounded-xl text-xl hover:scale-125 transition-all">👏</button>
          <button onclick="sendReaction('🎉')" class="p-2 hover:bg-white/10 rounded-xl text-xl hover:scale-125 transition-all">🎉</button>
          <button onclick="sendReaction('🔥')" class="p-2 hover:bg-white/10 rounded-xl text-xl hover:scale-125 transition-all">🔥</button>
          <button onclick="sendReaction('💡')" class="p-2 hover:bg-white/10 rounded-xl text-xl hover:scale-125 transition-all">💡</button>
          <button onclick="sendReaction('😂')" class="p-2 hover:bg-white/10 rounded-xl text-xl hover:scale-125 transition-all">😂</button>
        </div>
      </div>

      <!-- Video Details & AI Summary Card -->
      <div class="bg-[#0d111c] border border-slate-800/90 rounded-2xl p-5 space-y-3">
        <div class="flex items-center space-x-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span>Resumo Inteligente por IA</span>
        </div>
        <p class="text-sm text-slate-300 leading-relaxed">${this.escapeHtml(aiSummary)}</p>
      </div>
    </div>

    <!-- Right Sidebar: Comments, Chapters & Transcript (1 col) -->
    <div class="flex flex-col space-y-4">
      <!-- Tabs header -->
      <div class="bg-[#0d111c] border border-slate-800/90 rounded-2xl p-1 flex space-x-1">
        <button onclick="switchTab('comments')" id="tab-comments-btn" class="flex-1 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white transition-all shadow-sm">
          Comentários (<span id="comments-count">0</span>)
        </button>
        <button onclick="switchTab('chapters')" id="tab-chapters-btn" class="flex-1 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white transition-all">
          Capítulos (<span id="chapters-count">${(video.chapters || []).length}</span>)
        </button>
        <button onclick="switchTab('transcript')" id="tab-transcript-btn" class="flex-1 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white transition-all">
          Transcrição
        </button>
      </div>

      <!-- Tab 1: Comments Section -->
      <div id="comments-tab" class="bg-[#0d111c] border border-slate-800/90 rounded-2xl p-4 flex-1 flex flex-col h-[520px]">
        <!-- Comments list -->
        <div id="comments-list" class="flex-1 overflow-y-auto space-y-3 pr-1 text-sm">
          <!-- Populated by JS -->
        </div>

        <!-- Add Comment Form -->
        <div class="pt-3 border-t border-slate-800 mt-2 space-y-2">
          <div class="flex items-center space-x-2">
            <input type="text" id="comment-author" placeholder="Seu nome..." value="Espectador" class="bg-slate-900 border border-slate-700/60 rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500 w-32">
            <span class="text-xs text-cyan-400 font-mono" id="current-timestamp-badge">em 00:00</span>
          </div>
          <div class="flex space-x-2">
            <input type="text" id="comment-text" placeholder="Adicione seu comentário..." class="flex-1 bg-slate-900 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500" onkeydown="if(event.key==='Enter') submitComment()">
            <button onclick="submitComment()" class="bg-gradient-to-r from-indigo-600 to-cyan-600 hover:brightness-110 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-md">
              Enviar
            </button>
          </div>
        </div>
      </div>

      <!-- Tab 2: Chapters Section -->
      <div id="chapters-tab" class="hidden bg-[#0d111c] border border-slate-800/90 rounded-2xl p-4 flex-1 flex flex-col h-[520px]">
        <div class="text-xs text-slate-400 font-medium mb-3 flex items-center justify-between">
          <span>Capítulos do Vídeo</span>
          <span class="text-[10px] text-cyan-400">Clique para pular</span>
        </div>
        <div id="chapters-list" class="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
          <!-- Populated by JS -->
        </div>
      </div>

      <!-- Tab 3: Transcript Section -->
      <div id="transcript-tab" class="hidden bg-[#0d111c] border border-slate-800/90 rounded-2xl p-4 flex-1 flex flex-col h-[520px]">
        <div id="transcript-list" class="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
          <!-- Populated by JS -->
        </div>
      </div>
    </div>
  </main>

  <script>
    const videoId = "${video.id}";
    let comments = ${commentsJson};
    let reactions = ${reactionsJson};
    const transcript = ${transcriptJson};
    const chapters = ${chaptersJson};

    const video = document.getElementById('main-video');
    const playBtn = document.getElementById('big-play-btn');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const seekBar = document.getElementById('seek-bar');
    const timeDisplay = document.getElementById('time-display');
    const timeBadge = document.getElementById('current-timestamp-badge');
    const speedBtn = document.getElementById('speed-btn');

    // Register view count
    fetch('/api/recordings/' + videoId + '/view', { method: 'POST' }).catch(()=>{});

    function togglePlay() {
      if (video.paused) {
        video.play();
        playBtn.classList.add('hidden');
        playPauseBtn.innerHTML = '<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      } else {
        video.pause();
        playBtn.classList.remove('hidden');
        playPauseBtn.innerHTML = '<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      }
    }

    video.addEventListener('click', togglePlay);

    function formatTime(s) {
      if (isNaN(s)) return '00:00';
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    video.addEventListener('timeupdate', () => {
      const cur = video.currentTime;
      const dur = video.duration || 1;
      seekBar.value = (cur / dur) * 100;
      timeDisplay.textContent = formatTime(cur) + ' / ' + formatTime(dur);
      timeBadge.textContent = 'em ' + formatTime(cur);

      // Trigger floating emoji when video reaches reaction timestamp
      checkReactions(cur);
    });

    seekBar.addEventListener('input', (e) => {
      const dur = video.duration || 1;
      video.currentTime = (e.target.value / 100) * dur;
    });

    const speeds = [1, 1.25, 1.5, 2];
    let curSpeedIdx = 0;
    function cycleSpeed() {
      curSpeedIdx = (curSpeedIdx + 1) % speeds.length;
      video.playbackRate = speeds[curSpeedIdx];
      speedBtn.textContent = speeds[curSpeedIdx] + 'x';
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.getElementById('player-container').requestFullscreen().catch(()=>{});
      } else {
        document.exitFullscreen().catch(()=>{});
      }
    }

    // Reaction system
    let lastReactionTime = -1;
    function checkReactions(time) {
      if (Math.abs(time - lastReactionTime) < 0.5) return;
      reactions.forEach(r => {
        if (Math.abs(r.time - time) < 0.4) {
          spawnFloatingEmoji(r.emoji);
        }
      });
      lastReactionTime = time;
    }

    function spawnFloatingEmoji(emoji) {
      const area = document.getElementById('emoji-float-area');
      const el = document.createElement('div');
      el.className = 'floating-emoji';
      el.textContent = emoji;
      el.style.left = (20 + Math.random() * 60) + '%';
      el.style.bottom = '20px';
      area.appendChild(el);
      setTimeout(() => el.remove(), 1800);
    }

    async function sendReaction(emoji) {
      const cur = Math.round(video.currentTime * 10) / 10;
      spawnFloatingEmoji(emoji);

      try {
        const res = await fetch('/api/recordings/' + videoId + '/reaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji, time: cur })
        });
        const data = await res.json();
        if (data.reaction) {
          reactions.push(data.reaction);
          renderTimelineReactions();
        }
      } catch (e) {}
    }

    function renderTimelineReactions() {
      const container = document.getElementById('timeline-reactions');
      container.innerHTML = '';
      const dur = video.duration || 1;
      reactions.forEach(r => {
        const pct = (r.time / dur) * 100;
        const dot = document.createElement('div');
        dot.style.position = 'absolute';
        dot.style.left = pct + '%';
        dot.style.top = '-2px';
        dot.style.width = '6px';
        dot.style.height = '6px';
        dot.style.borderRadius = '50%';
        dot.style.backgroundColor = '#ff5b4f';
        container.appendChild(dot);
      });
    }

    // Comments system
    function renderComments() {
      const list = document.getElementById('comments-list');
      document.getElementById('comments-count').textContent = comments.length;
      if (comments.length === 0) {
        list.innerHTML = '<div class="text-center py-10 text-gray-500 text-xs">Nenhum comentário ainda.<br>Seja o primeiro a comentar!</div>';
        return;
      }
      list.innerHTML = comments.map(c => \`
        <div class="bg-gray-800/40 border border-gray-700/40 p-2.5 rounded-xl space-y-1">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-xs text-white">\${escapeText(c.author)}</span>
            <button onclick="video.currentTime = \${c.time}; video.play();" class="text-xs font-mono text-[#625df5] hover:underline font-medium">
              \${formatTime(c.time)}
            </button>
          </div>
          <p class="text-xs text-gray-300">\${escapeText(c.text)}</p>
        </div>
      \`).join('');
    }

    async function submitComment() {
      const author = document.getElementById('comment-author').value || 'Espectador';
      const text = document.getElementById('comment-text').value;
      if (!text.trim()) return;

      const time = Math.round(video.currentTime * 10) / 10;
      try {
        const res = await fetch('/api/recordings/' + videoId + '/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ author, text, time })
        });
        const data = await res.json();
        if (data.comment) {
          comments.push(data.comment);
          document.getElementById('comment-text').value = '';
          renderComments();
        }
      } catch (e) {}
    }

    function renderTranscript() {
      const list = document.getElementById('transcript-list');
      if (transcript.length === 0) {
        list.innerHTML = '<div class="text-center py-10 text-gray-500 text-xs">Nenhuma transcrição de áudio detectada nesta gravação.</div>';
        return;
      }
      list.innerHTML = transcript.map(t => \`
        <div onclick="video.currentTime = \${t.time}; video.play();" class="p-2 hover:bg-gray-800/60 rounded-xl cursor-pointer transition-colors flex space-x-2">
          <span class="font-mono text-indigo-400 font-bold">\${formatTime(t.time)}</span>
          <span class="text-gray-300">\${escapeText(t.text)}</span>
        </div>
      \`).join('');
    }

    function renderChapters() {
      const container = document.getElementById('chapters-list');
      if (!container) return;
      if (!chapters || chapters.length === 0) {
        container.innerHTML = '<p class="text-slate-500 italic p-3 text-center">Nenhum capítulo salvo para esta gravação.</p>';
        return;
      }
      container.innerHTML = chapters.map(c => \`
        <div onclick="jumpToChapter(\${c.time})" class="chapter-card p-3 rounded-xl border border-slate-800/80 hover:border-cyan-500/50 hover:bg-slate-800/60 cursor-pointer flex items-center space-x-3 transition-all group">
          <span class="font-mono text-cyan-400 font-bold bg-cyan-500/10 px-2.5 py-1 rounded-lg text-xs shrink-0 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-colors">
            \${formatTime(c.time)}
          </span>
          <span class="text-slate-200 font-semibold text-xs flex-1 truncate">\${escapeText(c.title)}</span>
          <svg class="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      \`).join('');
    }

    function renderTimelineChapters() {
      const container = document.getElementById('timeline-chapters');
      if (!container) return;
      container.innerHTML = '';
      const dur = video.duration || 1;
      chapters.forEach(c => {
        const pct = (c.time / dur) * 100;
        const tick = document.createElement('div');
        tick.style.position = 'absolute';
        tick.style.left = pct + '%';
        tick.style.top = '-3px';
        tick.style.width = '3px';
        tick.style.height = '12px';
        tick.style.borderRadius = '2px';
        tick.style.backgroundColor = '#fbbf24';
        tick.title = c.title + ' (' + formatTime(c.time) + ')';
        tick.style.pointerEvents = 'auto';
        tick.style.cursor = 'pointer';
        tick.onclick = (e) => {
          e.stopPropagation();
          jumpToChapter(c.time);
        };
        container.appendChild(tick);
      });
    }

    function jumpToChapter(time) {
      video.currentTime = time;
      video.play();
      playBtn.classList.add('hidden');
      playPauseBtn.innerHTML = '<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    }

    function switchTab(tab) {
      const cTab = document.getElementById('comments-tab');
      const chTab = document.getElementById('chapters-tab');
      const tTab = document.getElementById('transcript-tab');
      const cBtn = document.getElementById('tab-comments-btn');
      const chBtn = document.getElementById('tab-chapters-btn');
      const tBtn = document.getElementById('tab-transcript-btn');

      cTab.classList.add('hidden');
      chTab.classList.add('hidden');
      tTab.classList.add('hidden');
      cBtn.className = 'flex-1 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white transition-all';
      chBtn.className = 'flex-1 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white transition-all';
      tBtn.className = 'flex-1 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white transition-all';

      const activeStyle = 'flex-1 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white transition-all shadow-sm';

      if (tab === 'comments') {
        cTab.classList.remove('hidden');
        cBtn.className = activeStyle;
      } else if (tab === 'chapters') {
        chTab.classList.remove('hidden');
        chBtn.className = activeStyle;
      } else if (tab === 'transcript') {
        tTab.classList.remove('hidden');
        tBtn.className = activeStyle;
      }
    }

    function copyShareLink() {
      navigator.clipboard.writeText(window.location.href);
      const btn = document.getElementById('copy-btn-text');
      btn.textContent = 'Link Copiado!';
      setTimeout(() => btn.textContent = 'Copiar Link', 2000);
    }

    function copyEmbedCode() {
      const embedHtml = '<iframe src="' + window.location.href + '" width="640" height="360" frameborder="0" allowfullscreen></iframe>';
      navigator.clipboard.writeText(embedHtml);
      alert('Código embed copiado para a área de transferência!');
    }

    function escapeText(str) {
      const div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    }

    // Init
    renderComments();
    renderChapters();
    renderTranscript();
    video.addEventListener('loadedmetadata', () => {
      renderTimelineReactions();
      renderTimelineChapters();
    });
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  private renderDashboard(res: http.ServerResponse) {
    const list = this.getMetadata();

    const itemsHtml = list.map(v => `
      <div class="bg-[#16171d] border border-gray-800/90 rounded-2xl p-4 flex flex-col justify-between hover:border-indigo-500/50 transition-all shadow-lg group">
        <div>
          <div class="aspect-video bg-black rounded-xl overflow-hidden mb-3 relative flex items-center justify-center">
            <video src="/video/${v.id}#t=0.5" class="w-full h-full object-cover"></video>
            <div class="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-all flex items-center justify-center">
              <a href="/share/${v.id}" class="w-12 h-12 rounded-full bg-[#625df5]/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-all">
                <svg class="w-6 h-6 fill-current ml-0.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </a>
            </div>
          </div>
          <h3 class="text-sm font-semibold text-white truncate">${this.escapeHtml(v.title)}</h3>
          <p class="text-xs text-gray-400 mt-1">${new Date(v.createdAt).toLocaleDateString('pt-BR')} • ${(v.durationMs / 1000).toFixed(0)}s • ${v.viewsCount || 0} visualizações</p>
        </div>
        <div class="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between">
          <a href="/share/${v.id}" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300">Assistir Vídeo →</a>
          <button onclick="navigator.clipboard.writeText(window.location.origin + '/share/${v.id}'); alert('Link copiado!')" class="text-xs text-gray-400 hover:text-white">Copiar Link</button>
        </div>
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Aura Screen Studio - Galeria de Vídeos Compartilhados</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #080a0f; color: #f1f5f9; }</style>
</head>
<body class="min-h-screen p-8">
  <div class="max-w-6xl mx-auto space-y-6">
    <div class="flex items-center space-x-3 border-b border-slate-800 pb-5">
      <div class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-cyan-500 to-violet-500 p-0.5 shadow-lg shadow-cyan-500/20 flex items-center justify-center">
        <div class="w-full h-full bg-[#0d111c] rounded-[14px] flex items-center justify-center">
          <svg class="w-6 h-6 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" stroke="cyan" />
            <circle cx="12" cy="12" r="3.5" fill="#f43f5e" />
          </svg>
        </div>
      </div>
      <div>
        <h1 class="text-xl font-bold text-white tracking-tight">Aura Web Hub</h1>
        <p class="text-xs text-slate-400">Vídeos gravados com Aura Screen Studio disponíveis para reprodução e download</p>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
      ${itemsHtml || '<div class="col-span-full py-16 text-center text-slate-500 text-sm">Nenhum vídeo gravado ainda. Inicie sua primeira gravação com o Aura Screen Studio!</div>'}
    </div>
  </div>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  private handleLiveStream(req: http.IncomingMessage, res: http.ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=--frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    this.activeLiveClients.add(res);
    this.notifyViewersChanged();

    if (this.latestLiveJpeg && !this.isLivePaused) {
      try {
        this.writeFrameToClient(res, this.latestLiveJpeg);
      } catch (e) {}
    }

    const cleanup = () => {
      this.activeLiveClients.delete(res);
      this.notifyViewersChanged();
    };

    req.on('close', cleanup);
    req.on('end', cleanup);
    res.on('error', cleanup);
  }

  private handleLiveEvents(req: http.IncomingMessage, res: http.ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    res.write(`data: ${JSON.stringify({ type: 'init', status: this.getLiveStatus() })}\n\n`);

    this.liveEventClients.add(res);

    const cleanup = () => {
      this.liveEventClients.delete(res);
    };

    req.on('close', cleanup);
    res.on('error', cleanup);
  }

  private handleLiveReactionPost(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const emoji = data.emoji || '👍';
        const author = data.author || 'Espectador';
        const item = { emoji, author, time: Date.now() };

        this.broadcastLiveEvent({ type: 'reaction', ...item });
        if (this.onLiveReaction) {
          this.onLiveReaction(item);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      } catch (e) {}
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid reaction' }));
    });
  }

  private handleLiveQuestionPost(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const text = data.text?.trim() || '';
        const author = data.author || 'Espectador';
        if (text) {
          const item = { text, author, time: Date.now() };
          this.broadcastLiveEvent({ type: 'question', ...item });
          if (this.onLiveQuestion) {
            this.onLiveQuestion(item);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }
      } catch (e) {}
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid question' }));
    });
  }

  private renderLiveViewer(req: http.IncomingMessage, res: http.ServerResponse) {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Aura Screen Studio — Transmissão ao Vivo (Zoom Pro Suite)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes floatUp {
      0% { transform: translateY(0) scale(0.7); opacity: 1; }
      100% { transform: translateY(-160px) scale(1.4); opacity: 0; }
    }
    .floating-reaction {
      position: absolute;
      pointer-events: none;
      font-size: 2.2rem;
      animation: floatUp 2.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      z-index: 50;
    }
  </style>
</head>
<body class="bg-[#07090e] text-slate-100 min-h-screen flex flex-col font-['Plus_Jakarta_Sans',sans-serif] selection:bg-indigo-500 selection:text-white">
  <header class="border-b border-[#181d2a] bg-[#0c101a]/80 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
    <div class="flex items-center space-x-3">
      <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-rose-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
        <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
          <circle cx="12" cy="12" r="3.5" fill="currentColor" />
        </svg>
      </div>
      <div>
        <div class="flex items-center space-x-2">
          <h1 class="text-sm font-bold text-white tracking-tight" id="liveTitle">${this.escapeHtml(this.liveTitle)}</h1>
          <span id="liveBadge" class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${this.isLive ? (this.isLivePaused ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40') : 'bg-slate-800 text-slate-400 border border-slate-700'}">
            <span class="w-1.5 h-1.5 rounded-full ${this.isLive ? (this.isLivePaused ? 'bg-amber-400' : 'bg-emerald-400 animate-ping') : 'bg-slate-500'}"></span>
            <span>${this.isLive ? (this.isLivePaused ? 'PAUSADO' : 'AO VIVO') : 'OFFLINE'}</span>
          </span>
        </div>
        <p class="text-[11px] text-slate-400">Transmissão em tempo real via Aura Screen Studio (Zoom Pro Suite)</p>
      </div>
    </div>

    <div class="flex items-center space-x-3">
      <div class="flex items-center space-x-1.5 bg-[#141926] border border-[#23293a] px-2.5 py-1 rounded-lg text-xs text-slate-300">
        <svg class="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span id="viewerCount" class="font-bold text-white">${this.activeLiveClients.size}</span>
        <span class="hidden sm:inline text-slate-400">assistindo</span>
      </div>

      <div class="hidden sm:flex items-center space-x-1.5 bg-[#141926] border border-[#23293a] px-2.5 py-1 rounded-lg text-xs text-slate-300 font-mono">
        <span class="text-slate-400">Duração:</span>
        <span id="uptimeDisplay" class="font-bold text-indigo-300">00:00</span>
      </div>

      <button id="fullscreenBtn" class="p-1.5 rounded-lg bg-[#141926] hover:bg-[#1e2538] border border-[#23293a] text-slate-300 hover:text-white transition-colors" title="Tela Cheia (F)">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>
    </div>
  </header>

  <main class="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 relative overflow-hidden">
    <div id="videoContainer" class="relative w-full max-w-6xl aspect-video bg-[#030508] rounded-2xl overflow-hidden border border-[#1e2538] shadow-2xl flex items-center justify-center group">
      
      <img id="streamImg" src="/live/stream" alt="Compartilhamento de Tela" class="w-full h-full object-contain select-none" />

      <div id="pausedOverlay" class="${this.isLive && this.isLivePaused ? '' : 'hidden'} absolute inset-0 bg-[#07090e]/90 backdrop-blur-md flex flex-col items-center justify-center z-20 text-center p-6 transition-all duration-300">
        <div class="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-4 animate-pulse shadow-lg shadow-amber-500/10">
          <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-white mb-1.5">Compartilhamento de Tela Pausado</h2>
        <p class="text-slate-400 text-sm max-w-sm">O apresentador pausou temporariamente a exibição da tela. A transmissão continuará em instantes.</p>
      </div>

      <div id="offlineOverlay" class="${this.isLive ? 'hidden' : ''} absolute inset-0 bg-[#07090e]/95 backdrop-blur-md flex flex-col items-center justify-center z-20 text-center p-6 transition-all duration-300">
        <div class="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 mb-4 shadow-lg shadow-indigo-500/10">
          <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-white mb-1.5">Aguardando Início da Transmissão</h2>
        <p class="text-slate-400 text-sm max-w-sm">O apresentador ainda não iniciou a transmissão. Esta tela se conectará automaticamente assim que a live começar.</p>
      </div>

      <div id="reactionsLayer" class="absolute inset-0 pointer-events-none overflow-hidden z-30"></div>
    </div>
  </main>

  <footer class="border-t border-[#181d2a] bg-[#0c101a]/90 backdrop-blur-md px-4 py-3 sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center space-x-2">
      <span class="text-xs text-slate-400 hidden sm:inline">Reações ao vivo:</span>
      <div class="flex items-center space-x-1.5 bg-[#141926] p-1 rounded-xl border border-[#23293a]">
        <button onclick="sendReaction('👏')" class="px-2.5 py-1 rounded-lg hover:bg-slate-700/60 active:scale-95 transition-all text-base" title="Aplaudir">👏</button>
        <button onclick="sendReaction('❤️')" class="px-2.5 py-1 rounded-lg hover:bg-slate-700/60 active:scale-95 transition-all text-base" title="Amei">❤️</button>
        <button onclick="sendReaction('👍')" class="px-2.5 py-1 rounded-lg hover:bg-slate-700/60 active:scale-95 transition-all text-base" title="Gostei">👍</button>
        <button onclick="sendReaction('🔥')" class="px-2.5 py-1 rounded-lg hover:bg-slate-700/60 active:scale-95 transition-all text-base" title="Incrível">🔥</button>
        <button onclick="sendReaction('💡')" class="px-2.5 py-1 rounded-lg hover:bg-slate-700/60 active:scale-95 transition-all text-base" title="Ideia">💡</button>
        <button onclick="sendReaction('❓')" class="px-2.5 py-1 rounded-lg hover:bg-slate-700/60 active:scale-95 transition-all text-base" title="Dúvida">❓</button>
      </div>
    </div>

    <form id="questionForm" onsubmit="submitQuestion(event)" class="flex items-center space-x-2 w-full sm:w-auto">
      <input
        type="text"
        id="questionInput"
        placeholder="Fazer pergunta ao apresentador..."
        class="bg-[#141926] border border-[#23293a] focus:border-indigo-500 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none w-full sm:w-72 transition-colors"
      />
      <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-medium px-3 py-1.5 rounded-xl text-xs transition-all shrink-0">
        Enviar
      </button>
    </form>
  </footer>

  <script>
    let uptimeSeconds = 0;
    setInterval(() => {
      uptimeSeconds++;
      const m = Math.floor(uptimeSeconds / 60).toString().padStart(2, '0');
      const s = (uptimeSeconds % 60).toString().padStart(2, '0');
      document.getElementById('uptimeDisplay').textContent = m + ':' + s;
    }, 1000);

    document.getElementById('fullscreenBtn').addEventListener('click', () => {
      const el = document.getElementById('videoContainer');
      if (!document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    const streamImg = document.getElementById('streamImg');
    streamImg.onerror = () => {
      setTimeout(() => {
        streamImg.src = '/live/stream?t=' + Date.now();
      }, 2000);
    };

    function spawnParticle(emoji) {
      const layer = document.getElementById('reactionsLayer');
      if (!layer) return;
      const el = document.createElement('div');
      el.className = 'floating-reaction';
      el.textContent = emoji;
      el.style.left = (Math.random() * 70 + 15) + '%';
      el.style.bottom = '20px';
      layer.appendChild(el);
      setTimeout(() => el.remove(), 2500);
    }

    function sendReaction(emoji) {
      spawnParticle(emoji);
      fetch('/api/live/reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji })
      }).catch(() => {});
    }

    function submitQuestion(e) {
      e.preventDefault();
      const input = document.getElementById('questionInput');
      const val = input.value.trim();
      if (!val) return;
      fetch('/api/live/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: val })
      }).then(() => {
        input.value = '';
        input.placeholder = 'Pergunta enviada!';
        setTimeout(() => { input.placeholder = 'Fazer pergunta ao apresentador...'; }, 3000);
      }).catch(() => {});
    }

    function connectEvents() {
      const evtSource = new EventSource('/api/live/events');
      evtSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'init' || data.type === 'status') {
            const status = data.status || data;
            const pausedOverlay = document.getElementById('pausedOverlay');
            const offlineOverlay = document.getElementById('offlineOverlay');
            const liveBadge = document.getElementById('liveBadge');

            if (!status.isLive) {
              offlineOverlay.classList.remove('hidden');
              pausedOverlay.classList.add('hidden');
              liveBadge.innerHTML = '<span>OFFLINE</span>';
              liveBadge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700';
            } else if (status.isPaused) {
              pausedOverlay.classList.remove('hidden');
              offlineOverlay.classList.add('hidden');
              liveBadge.innerHTML = '<span>PAUSADO</span>';
              liveBadge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40';
            } else {
              pausedOverlay.classList.add('hidden');
              offlineOverlay.classList.add('hidden');
              liveBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping mr-1"></span><span>AO VIVO</span>';
              liveBadge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
            }
          } else if (data.type === 'viewers') {
            document.getElementById('viewerCount').textContent = data.count;
          } else if (data.type === 'reaction') {
            spawnParticle(data.emoji);
          }
        } catch (err) {}
      };
      evtSource.onerror = () => {
        evtSource.close();
        setTimeout(connectEvents, 3000);
      };
    }
    connectEvents();
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
