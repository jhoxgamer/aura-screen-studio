import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  FolderOpen,
  Copy,
  Check,
  Scissors,
  Download,
  Share2,
  Trash2,
  Sparkles,
  ArrowLeft,
  Globe,
  ExternalLink,
  Edit2,
  PlusCircle,
  Clock,
  Video,
  CheckCircle2,
  Activity,
  Bookmark,
  Plus
} from 'lucide-react';
import { RecordingMeta, ChapterItem } from '../types';
import confetti from 'canvas-confetti';
import { getShortcutLabel } from '../utils/shortcuts';

export const PreviewView: React.FC = () => {
  const [meta, setMeta] = useState<RecordingMeta | null>(null);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playerVolume, setPlayerVolume] = useState<number>(() => {
    const saved = localStorage.getItem('aura_player_volume');
    return saved !== null ? Number(saved) : 1;
  });
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // Trimming states
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isTrimming, setIsTrimming] = useState(false);
  const [isTrimmingSaving, setIsTrimmingSaving] = useState(false);

  // Chapters & Audio Waveform state
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [isSavingChapters, setIsSavingChapters] = useState(false);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');

  // Server port & feedback state
  const [serverPort, setServerPort] = useState<number>(4545);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const videoRef = useRef<HTMLVideoElement>(null);

  const extractWaveform = async (url: string) => {
    try {
      setIsLoadingWaveform(true);
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      const channelData = audioBuffer.getChannelData(0);
      const samplesCount = 120;
      const blockSize = Math.floor(channelData.length / samplesCount);
      const peaks: number[] = [];
      for (let i = 0; i < samplesCount; i++) {
        const start = i * blockSize;
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(channelData[start + j] || 0);
        }
        peaks.push(sum / blockSize);
      }
      const maxVal = Math.max(...peaks, 0.0001);
      const normalized = peaks.map((p) => Math.max(0.12, Math.min(1, p / maxVal)));
      setWaveformPeaks(normalized);
      audioCtx.close().catch(() => {});
    } catch (err) {
      console.warn('Waveform audio decode fallback:', err);
      // Soft organic visual wave fallback
      const fallback = Array.from({ length: 120 }, (_, i) => 0.2 + 0.6 * Math.abs(Math.sin(i / 8) * Math.cos(i / 15)));
      setWaveformPeaks(fallback);
    } finally {
      setIsLoadingWaveform(false);
    }
  };

  useEffect(() => {
    const cleanup = window.electronAPI.onOpenPreview(async (receivedMeta) => {
      setMeta(receivedMeta);
      setEditedTitle(receivedMeta.title || '');
      setChapters(receivedMeta.chapters || []);
      try {
        const url = await window.electronAPI.getShareUrl(receivedMeta.id);
        setShareUrl(url);
        const pub = await window.electronAPI.getPublicUrl();
        setPublicUrl(pub);
      } catch (e) {}

      let port = 4545;
      try {
        if (window.electronAPI?.getServerPort) {
          port = await window.electronAPI.getServerPort();
          setServerPort(port);
        }
      } catch (e) {}

      const videoSrc = receivedMeta.id
        ? `http://localhost:${port}/video/${receivedMeta.id}`
        : `file://${receivedMeta.filePath}`;
      extractWaveform(videoSrc);

      // Celebratory studio completion feedback
      try {
        confetti({
          particleCount: 45,
          spread: 55,
          origin: { y: 0.7 },
          colors: ['#6366f1', '#f43f5e', '#10b981', '#f59e0b']
        });
      } catch (confettiErr) {}
    });

    // Check public URL periodically until ready
    const pubInterval = setInterval(async () => {
      try {
        const pub = await window.electronAPI.getPublicUrl();
        if (pub) {
          setPublicUrl(pub);
          if (meta) {
            const url = await window.electronAPI.getShareUrl(meta.id);
            setShareUrl(url);
          }
        }
      } catch (e) {}
    }, 1500);

    return () => {
      cleanup();
      clearInterval(pubInterval);
    };
  }, [meta?.id]);

  // Video Player Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditingTitle) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
        }
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        if (videoRef.current) {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            videoRef.current.requestFullscreen().catch(() => {});
          }
        }
      } else if (e.code === 'Digit1') {
        e.preventDefault();
        setPlaybackRate(1);
        if (videoRef.current) videoRef.current.playbackRate = 1;
      } else if (e.code === 'Digit2') {
        e.preventDefault();
        setPlaybackRate(1.25);
        if (videoRef.current) videoRef.current.playbackRate = 1.25;
      } else if (e.code === 'Digit3') {
        e.preventDefault();
        setPlaybackRate(1.5);
        if (videoRef.current) videoRef.current.playbackRate = 1.5;
      } else if (e.code === 'Digit4') {
        e.preventDefault();
        setPlaybackRate(2);
        if (videoRef.current) videoRef.current.playbackRate = 2;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        handleShareLink();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isMuted, duration, isEditingTitle, meta, shareUrl]);

  const handleShareLink = async () => {
    if (!meta) return;
    const url = shareUrl || await window.electronAPI.getShareUrl(meta.id);
    navigator.clipboard.writeText(url);
    setIsLinkCopied(true);
    showToast('Link do vídeo copiado para a área de transferência!', 'success');
    setTimeout(() => setIsLinkCopied(false), 2500);
  };

  const handleOpenInBrowser = async () => {
    if (!meta) return;
    const url = shareUrl || await window.electronAPI.getShareUrl(meta.id);
    window.electronAPI.openExternalUrl(url);
  };

  const handleSaveTitle = async () => {
    if (!meta || !editedTitle.trim()) return;
    await window.electronAPI.updateTitle(meta.id, editedTitle.trim());
    setMeta({ ...meta, title: editedTitle.trim() });
    setIsEditingTitle(false);
  };

  const handleDownload = async () => {
    if (!meta) return;
    await window.electronAPI.downloadRecording(meta.id);
  };

  const handleNewRecording = () => {
    window.electronAPI.openPreRecording();
    window.electronAPI.closeCurrentWindow();
  };

  const handleDelete = async () => {
    if (!meta) return;
    try {
      await window.electronAPI.deleteRecording(meta.id);
      window.electronAPI.openPreRecording();
      window.electronAPI.closeCurrentWindow();
    } catch (err) {
      showToast('Erro ao excluir gravação.', 'error');
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setTrimEnd(dur);
      videoRef.current.volume = playerVolume;
      videoRef.current.muted = isMuted;
    }
  };

  useEffect(() => {
    localStorage.setItem('aura_player_volume', String(playerVolume));
  }, [playerVolume]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      setCurrentTime(cur);

      // Loop or stop if reached trimEnd
      if (isTrimming && cur >= trimEnd) {
        videoRef.current.currentTime = trimStart;
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const handleSpeedChange = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    setPlaybackRate(nextSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    videoRef.current.muted = nextMute;
  };

  const handleOpenFolder = () => {
    if (meta?.filePath) {
      window.electronAPI.openFileFolder(meta.filePath);
    }
  };

  const handleSaveTrim = async () => {
    if (!meta || !videoRef.current) return;
    setIsTrimmingSaving(true);
    const vid = videoRef.current;
    const prevPlaybackRate = vid.playbackRate;
    try {
      vid.pause();
      vid.playbackRate = 1.0;
      vid.currentTime = trimStart;
      await new Promise((r) => setTimeout(r, 200));

      const stream = (vid as any).captureStream ? (vid as any).captureStream() : null;
      if (!stream) {
        showToast('Corte direto não suportado pelo navegador.', 'error');
        setIsTrimmingSaving(false);
        vid.playbackRate = prevPlaybackRate;
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const durationToRecord = (trimEnd - trimStart) * 1000;
      recorder.start();
      vid.play();

      await new Promise<void>((resolve) => {
        let watchdog: any = null;
        const check = () => {
          if (vid.currentTime >= trimEnd || vid.ended) {
            if (watchdog) clearTimeout(watchdog);
            if (recorder.state === 'recording') recorder.stop();
            vid.pause();
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };

        // Safety watchdog: stop even if timeupdate or requestAnimationFrame stalls
        watchdog = setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
            vid.pause();
          }
          resolve();
        }, Math.max(durationToRecord + 3000, 5000));

        check();
      });

      await new Promise((r) => (recorder.onstop = r as any));
      const trimmedBlob = new Blob(chunks, { type: 'video/webm' });
      const buffer = await trimmedBlob.arrayBuffer();

      const updated = await window.electronAPI.trimRecording(meta.id, buffer, durationToRecord);
      if (updated) {
        setMeta(updated);
        setIsTrimming(false);
        showToast('Vídeo cortado e salvo com sucesso!', 'success');
      }
    } catch (e) {
      console.error('Error saving trim:', e);
      showToast('Erro ao salvar corte.', 'error');
    } finally {
      vid.playbackRate = prevPlaybackRate;
      setIsTrimmingSaving(false);
    }
  };

  const handleSaveChapters = async () => {
    if (!meta) return;
    setIsSavingChapters(true);
    try {
      await window.electronAPI.updateChapters(meta.id, chapters);
      setMeta({ ...meta, chapters });
      showToast('Capítulos atualizados com sucesso!', 'success');
    } catch (e) {
      console.error('Error saving chapters:', e);
      showToast('Erro ao salvar capítulos.', 'error');
    } finally {
      setIsSavingChapters(false);
    }
  };

  const handleAddChapterAtCurrentTime = () => {
    const time = Math.round(currentTime * 10) / 10;
    const title = newChapterTitle.trim() || `Capítulo às ${formatTime(time)}`;
    const newChap: ChapterItem = {
      id: 'chap_' + Date.now(),
      time,
      title
    };
    const updated = [...chapters, newChap].sort((a, b) => a.time - b.time);
    setChapters(updated);
    setNewChapterTitle('');
  };

  const handleRemoveChapter = (id: string) => {
    setChapters(chapters.filter((c) => c.id !== id));
  };

  const handleUpdateChapterTitle = (id: string, title: string) => {
    setChapters(chapters.map((c) => (c.id === id ? { ...c, title } : c)));
  };

  const formatTime = (timeInSeconds: number) => {
    const mins = Math.floor(timeInSeconds / 60);
    const secs = Math.floor(timeInSeconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isPublicInternetLink = shareUrl.includes('trycloudflare.com');

  return (
    <div className="w-full h-full min-h-screen bg-[#0c0e14] text-white flex flex-col select-none overflow-hidden font-sans">
      {/* Top Header */}
      <div className="h-16 bg-[#121520] border-b border-[#202534] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#1a1f2e] border border-[#2e374d] flex items-center justify-center shrink-0">
            <div className="w-4 h-4 rounded-full border-2 border-indigo-400 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            </div>
          </div>

          <div className="min-w-0">
            {isEditingTitle ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                  autoFocus
                  className="bg-[#0c0e14] border border-indigo-500 rounded px-2 py-0.5 text-xs text-white font-semibold focus:outline-none"
                />
                <button
                  onClick={handleSaveTitle}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded font-medium"
                >
                  Salvar
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 group cursor-pointer" onClick={() => setIsEditingTitle(true)}>
                <h1 className="text-sm font-semibold text-white leading-tight truncate max-w-sm hover:text-indigo-300 transition-colors">
                  {meta?.title || 'Gravação Concluída'}
                </h1>
                <Edit2 className="w-3 h-3 text-slate-400 group-hover:text-indigo-300 transition-colors shrink-0" />
              </div>
            )}

            <div className="flex items-center space-x-2 mt-0.5 text-[11px] text-slate-400">
              <span>{meta ? `${formatFileSize(meta.fileSize)} • ${meta.resolution} • ${(duration).toFixed(0)}s` : ''}</span>
              <span>•</span>
              {isPublicInternetLink ? (
                <span className="inline-flex items-center space-x-1 text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  <span>Link Público Ativo</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 text-indigo-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                  <span>Conectando link global...</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Share Link Button */}
          <button
            onClick={handleShareLink}
            title={`Copiar Link Público (${getShortcutLabel('l')})`}
            className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm"
          >
            {isLinkCopied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{isLinkCopied ? 'Link Copiado!' : 'Copiar Link Público'}</span>
          </button>

          {/* Open in Browser */}
          <button
            onClick={handleOpenInBrowser}
            className="flex items-center space-x-1.5 bg-[#171b26] hover:bg-[#202536] border border-[#262c3e] px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 transition-all shadow-sm"
            title="Abrir página pública no navegador"
          >
            <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
            <span>Ver no Navegador</span>
          </button>

          {/* Download Video */}
          <button
            onClick={handleDownload}
            className="flex items-center space-x-1.5 bg-[#171b26] hover:bg-[#202536] border border-[#262c3e] px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 transition-all shadow-sm"
            title="Salvar arquivo de vídeo no computador"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Baixar Vídeo</span>
          </button>

          {/* Open Folder */}
          <button
            onClick={handleOpenFolder}
            className="p-2 rounded-xl bg-[#171b26] hover:bg-[#202536] border border-[#262c3e] text-slate-400 hover:text-white transition-all shadow-sm"
            title="Abrir pasta no Windows Explorer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>

          {/* New Recording */}
          <button
            onClick={handleNewRecording}
            className="flex items-center space-x-1.5 bg-[#171b26] hover:bg-[#202536] border border-[#262c3e] px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 transition-all shadow-sm"
            title="Iniciar nova gravação"
          >
            <PlusCircle className="w-3.5 h-3.5 text-indigo-400" />
            <span>Nova Gravação</span>
          </button>

          {/* Delete */}
          <button
            onClick={() => setIsConfirmingDelete(true)}
            className="p-2 rounded-xl bg-[#171b26] hover:bg-rose-500/20 border border-[#262c3e] text-slate-400 hover:text-rose-400 transition-all shadow-sm"
            title="Excluir gravação"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Share Link Banner Alert */}
      <div className="bg-[#121520] border-b border-[#202534] px-6 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 truncate">
          <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="text-slate-400">Link de compartilhamento para qualquer pessoa assistir:</span>
          <span className="font-mono text-indigo-300 font-semibold select-all truncate max-w-lg">
            {shareUrl || 'Gerando link público...'}
          </span>
        </div>
        <button
          onClick={handleShareLink}
          title={`Copiar Link (${getShortcutLabel('l')})`}
          className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline font-semibold shrink-0 ml-4"
        >
          {isLinkCopied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>

      {/* Main Content Area: Video Player & Editor */}
      <div className="flex-1 flex flex-col p-6 items-center justify-start max-w-5xl mx-auto w-full overflow-y-auto">
        {/* Video Player Container */}
        <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-loom-border shadow-2xl flex items-center justify-center group shrink-0">
          {meta?.filePath ? (
            <video
              ref={videoRef}
              src={
                meta.id
                  ? `http://localhost:${serverPort}/video/${meta.id}`
                  : `file://${meta.filePath}`
              }
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onClick={togglePlay}
              className="w-full h-full object-contain cursor-pointer"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-loom-muted space-y-2">
              <Play className="w-12 h-12 text-loom-muted" />
              <span className="text-sm">Carregando visualização do vídeo...</span>
            </div>
          )}

          {/* Big Play Button Overlay when Paused */}
          {!isPlaying && meta?.filePath && (
            <button
              onClick={togglePlay}
              title="Reproduzir (Espaço)"
              className="absolute w-16 h-16 rounded-full bg-loom-primary/90 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all"
            >
              <Play className="w-8 h-8 fill-current ml-1" />
            </button>
          )}

          {/* Video Control Bar Overlay */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Scrubber / Progress Bar */}
            <div className="mb-3">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                title="Barra de Navegação (Setas Esquerda / Direita)"
                className="w-full h-1.5 bg-white/20 accent-loom-coral rounded-lg cursor-pointer appearance-none"
              />
            </div>

            <div className="flex items-center justify-between">
              {/* Play / Pause / Time */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={togglePlay}
                  title="Reproduzir / Pausar (Espaço)"
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
                </button>

                <span className="text-xs font-mono font-medium text-white/90">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Speed & Volume & Fullscreen */}
              <div className="flex items-center space-x-3">
                {/* Speed Multiplier */}
                <button
                  onClick={handleSpeedChange}
                  title="Alternar Velocidade (1x, 1.25x, 1.5x, 2x) ou Teclas 1, 2, 3, 4"
                  className="text-xs font-bold bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg text-white transition-colors font-mono"
                >
                  {playbackRate}x
                </button>

                {/* Volume & Mute Control with Slider */}
                <div className="flex items-center space-x-1.5 group/vol">
                  <button
                    onClick={toggleMute}
                    title={isMuted ? 'Ativar Áudio (M)' : 'Silenciar Áudio (M)'}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
                  >
                    {isMuted || playerVolume === 0 ? (
                      <VolumeX className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>

                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : playerVolume}
                    onChange={(e) => {
                      const newVol = Number(e.target.value);
                      setPlayerVolume(newVol);
                      if (videoRef.current) {
                        videoRef.current.volume = newVol;
                        if (newVol > 0 && isMuted) {
                          setIsMuted(false);
                          videoRef.current.muted = false;
                        }
                      }
                    }}
                    title={`Volume: ${Math.round((isMuted ? 0 : playerVolume) * 100)}%`}
                    className="w-16 h-1 bg-white/20 hover:bg-white/40 rounded-lg appearance-none cursor-pointer accent-indigo-400 transition-opacity"
                  />
                </div>

                {/* Fullscreen */}
                <button
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.requestFullscreen();
                    }
                  }}
                  title="Tela Cheia (F)"
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
                >
                  <Maximize className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Real Audio Waveform Timeline & Precision Scrubber */}
        <div className="w-full mt-4 bg-loom-panel border border-loom-border rounded-2xl p-4 shadow-xl flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                Linha do Tempo com Waveform Real
              </span>
              {isLoadingWaveform && (
                <span className="text-[10px] text-loom-muted animate-pulse">
                  (decodificando áudio...)
                </span>
              )}
            </div>
            <div className="flex items-center space-x-3 text-xs font-mono">
              <span className="text-indigo-400 font-bold">{formatTime(currentTime)}</span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-400">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Interactive Waveform Canvas Container */}
          <div
            className="relative h-16 w-full bg-[#080b12] rounded-xl overflow-hidden border border-slate-800/80 cursor-pointer flex items-center px-1"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickPct = (e.clientX - rect.left) / rect.width;
              const targetTime = clickPct * duration;
              setCurrentTime(targetTime);
              if (videoRef.current) videoRef.current.currentTime = targetTime;
            }}
          >
            {/* Waveform Bars */}
            <div className="w-full h-full flex items-center justify-between px-1 space-x-[2px]">
              {waveformPeaks.map((peak, idx) => {
                const barPct = idx / waveformPeaks.length;
                const isPlayed = barPct <= (duration > 0 ? currentTime / duration : 0);
                const isInsideTrim =
                  barPct >= (duration > 0 ? trimStart / duration : 0) &&
                  barPct <= (duration > 0 ? trimEnd / duration : 1);
                const barHeight = Math.max(8, Math.round(peak * 54));

                let barColor = 'bg-slate-700/50';
                if (isInsideTrim) {
                  barColor = isPlayed
                    ? 'bg-indigo-500 shadow-sm shadow-indigo-500/30'
                    : 'bg-slate-500 hover:bg-slate-400';
                } else {
                  barColor = 'bg-slate-800/30';
                }

                return (
                  <div
                    key={idx}
                    className={`flex-1 rounded-full transition-all duration-75 ${barColor}`}
                    style={{ height: `${barHeight}px` }}
                  />
                );
              })}
            </div>

            {/* Playhead Vertical Line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.6)] pointer-events-none transition-all duration-75"
              style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            >
              <div className="w-2.5 h-2.5 -ml-1 rounded-full bg-indigo-400 shadow-sm" />
            </div>

            {/* Chapter Markers Ticks on Waveform */}
            {chapters.map((chap) => {
              const leftPct = duration > 0 ? (chap.time / duration) * 100 : 0;
              return (
                <div
                  key={chap.id}
                  title={`${chap.title} (${formatTime(chap.time)})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (videoRef.current) {
                      videoRef.current.currentTime = chap.time;
                      setCurrentTime(chap.time);
                    }
                  }}
                  className="absolute top-0 bottom-0 w-1 bg-amber-400 hover:bg-amber-300 hover:w-1.5 transition-all z-20 group cursor-pointer"
                  style={{ left: `${leftPct}%` }}
                >
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap pointer-events-none transition-opacity">
                    {chap.title} ({formatTime(chap.time)})
                  </div>
                </div>
              );
            })}

            {/* Trim Boundary Overlays */}
            {isTrimming && (
              <>
                <div
                  className="absolute top-0 bottom-0 left-0 bg-black/60 pointer-events-none border-r-2 border-rose-500"
                  style={{ width: `${duration > 0 ? (trimStart / duration) * 100 : 0}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 right-0 bg-black/60 pointer-events-none border-l-2 border-rose-500"
                  style={{ width: `${duration > 0 ? Math.max(0, (1 - trimEnd / duration) * 100) : 0}%` }}
                />
              </>
            )}
          </div>
        </div>

        {/* Trimming & Video Editing Section */}
        <div className="w-full mt-4 bg-loom-panel border border-loom-border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            <Scissors className="w-4 h-4 text-indigo-400 shrink-0" />
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-white block">Ajustar e Cortar Vídeo (Trimming)</span>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.2 rounded font-mono font-medium">
                  Final: {Math.max(0, trimEnd - trimStart).toFixed(1)}s
                </span>
              </div>
              <span className="text-[11px] text-loom-muted">Defina início e fim para remover partes indesejadas</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 text-xs">
              <span className="text-loom-muted">Início:</span>
              <input
                type="number"
                min={0}
                max={trimEnd}
                step={0.5}
                value={Number(trimStart.toFixed(1))}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTrimStart(val);
                  if (videoRef.current) videoRef.current.currentTime = val;
                }}
                className="w-16 bg-loom-card border border-loom-border rounded px-2 py-1 text-white font-mono text-xs focus:border-indigo-500 outline-none"
              />
              <span className="text-loom-muted">s</span>
              <button
                type="button"
                onClick={() => {
                  const point = Math.min(currentTime, trimEnd);
                  setTrimStart(Number(point.toFixed(1)));
                }}
                title="Marcar início no segundo atual do player"
                className="px-1.5 py-1 text-[10px] font-semibold bg-slate-800 hover:bg-indigo-600/30 text-indigo-300 hover:text-white rounded border border-slate-700 hover:border-indigo-500/40 transition-colors"
              >
                Atual
              </button>
            </div>

            <div className="flex items-center space-x-1.5 text-xs">
              <span className="text-loom-muted">Fim:</span>
              <input
                type="number"
                min={trimStart}
                max={duration}
                step={0.5}
                value={Number(trimEnd.toFixed(1))}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTrimEnd(val);
                }}
                className="w-16 bg-loom-card border border-loom-border rounded px-2 py-1 text-white font-mono text-xs focus:border-indigo-500 outline-none"
              />
              <span className="text-loom-muted">s</span>
              <button
                type="button"
                onClick={() => {
                  const point = Math.max(currentTime, trimStart);
                  setTrimEnd(Number(point.toFixed(1)));
                }}
                title="Marcar fim no segundo atual do player"
                className="px-1.5 py-1 text-[10px] font-semibold bg-slate-800 hover:bg-indigo-600/30 text-indigo-300 hover:text-white rounded border border-slate-700 hover:border-indigo-500/40 transition-colors"
              >
                Atual
              </button>
            </div>

            <button
              onClick={() => setIsTrimming(!isTrimming)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isTrimming
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                  : 'bg-loom-card border border-loom-border text-loom-muted hover:text-white'
              }`}
            >
              {isTrimming ? 'Prévia Ativa' : 'Testar Prévia'}
            </button>

            <button
              onClick={handleSaveTrim}
              disabled={isTrimmingSaving || (trimStart === 0 && trimEnd === duration)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-sm transition-colors"
            >
              {isTrimmingSaving ? 'Cortando...' : 'Salvar Corte'}
            </button>
          </div>
        </div>

        {/* AI Summary, Chapters & Transcript 3-Column Studio Grid */}
        <div className="w-full mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 pb-6 shrink-0">
          {/* AI Summary Card */}
          <div className="bg-loom-panel border border-loom-border rounded-xl p-4 space-y-2">
            <div className="flex items-center space-x-2 text-loom-primary text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Resumo Inteligente</span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line max-h-48 overflow-y-auto">
              {meta?.aiSummary || 'Explicação gravada com sucesso pelo Aura Screen Studio.'}
            </p>
          </div>

          {/* Interactive Chapters Card */}
          <div className="bg-loom-panel border border-loom-border rounded-xl p-4 space-y-3 flex flex-col max-h-56">
            <div className="flex items-center justify-between text-indigo-400 text-xs font-bold uppercase tracking-wider">
              <div className="flex items-center space-x-1.5">
                <Bookmark className="w-4 h-4" />
                <span>Capítulos ({chapters.length})</span>
              </div>
              <button
                onClick={handleSaveChapters}
                disabled={isSavingChapters}
                className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded-lg font-medium transition-colors shadow-sm"
              >
                {isSavingChapters ? 'Salvando...' : 'Salvar'}
              </button>
            </div>

            {/* Quick Add Chapter at current timestamp */}
            <div className="flex items-center space-x-1.5 pt-0.5">
              <input
                type="text"
                placeholder="Título do capítulo..."
                value={newChapterTitle}
                onChange={(e) => setNewChapterTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddChapterAtCurrentTime();
                }}
                className="flex-1 bg-loom-card border border-loom-border rounded-lg px-2 py-1 text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleAddChapterAtCurrentTime}
                className="flex items-center space-x-1 bg-loom-primary hover:bg-loom-primaryHover text-white px-2 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors"
                title={`Adicionar no segundo ${formatTime(currentTime)}`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+{formatTime(currentTime)}</span>
              </button>
            </div>

            {/* Chapters List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {chapters.length > 0 ? (
                chapters.map((chap) => (
                  <div
                    key={chap.id}
                    className="flex items-center space-x-2 bg-loom-card/80 hover:bg-loom-card border border-loom-border/60 p-1.5 rounded-lg transition-colors group"
                  >
                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = chap.time;
                          setCurrentTime(chap.time);
                          videoRef.current.play();
                          setIsPlaying(true);
                        }
                      }}
                      className="font-mono text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/25 px-1.5 py-0.5 rounded text-[11px] font-bold shrink-0 transition-colors"
                      title="Pular para este segundo"
                    >
                      {formatTime(chap.time)}
                    </button>
                    <input
                      type="text"
                      value={chap.title}
                      onChange={(e) => handleUpdateChapterTitle(chap.id, e.target.value)}
                      className="flex-1 bg-transparent text-xs text-gray-200 focus:text-white outline-none border-b border-transparent focus:border-indigo-500/50"
                    />
                    <button
                      onClick={() => handleRemoveChapter(chap.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-1 transition-all"
                      title="Remover capítulo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-loom-muted italic pt-1">
                  Nenhum capítulo salvo. Adicione marcadores no segundo desejado!
                </p>
              )}
            </div>
          </div>

          {/* Transcript / Spoken Timeline */}
          <div className="bg-loom-panel border border-loom-border rounded-xl p-4 space-y-2 max-h-56 overflow-y-auto">
            <div className="flex items-center justify-between text-loom-secondary text-xs font-bold uppercase tracking-wider">
              <span>Transcrição</span>
              <span className="text-[10px] text-loom-muted font-normal">
                {meta?.transcript?.length || 0} frases
              </span>
            </div>

            {meta?.transcript && meta.transcript.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                {meta.transcript.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = item.time;
                        videoRef.current.play();
                        setIsPlaying(true);
                      }
                    }}
                    className="p-1.5 rounded-lg hover:bg-loom-card cursor-pointer transition-colors flex items-start space-x-2 text-xs"
                  >
                    <span className="font-mono text-loom-primary font-bold shrink-0">
                      {formatTime(item.time)}
                    </span>
                    <span className="text-gray-300">{item.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-loom-muted italic pt-2">
                Nenhuma fala capturada durante esta gravação.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Non-blocking Delete Confirmation Modal */}
      {isConfirmingDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121520] border border-rose-500/40 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Excluir Gravação?</h3>
              <p className="text-xs text-slate-400 mt-1">
                O arquivo de vídeo será removido permanentemente do disco. Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-1">
              <button
                onClick={() => setIsConfirmingDelete(false)}
                className="flex-1 py-2 px-3 bg-[#181c28] hover:bg-[#202536] text-slate-300 text-xs font-semibold rounded-xl border border-[#262c3e] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking Toast Notification */}
      {toast && (
        <div className="fixed top-14 right-6 z-50 flex items-center space-x-2 px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-medium bg-[#121520]/95 backdrop-blur-md border-indigo-500/40 text-white animate-in fade-in">
          {toast.type === 'success' && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
          {toast.type === 'error' && <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />}
          {toast.type === 'info' && <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};
