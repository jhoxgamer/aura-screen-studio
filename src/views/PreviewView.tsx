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
  Plus,
  MoreHorizontal
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
  const [isPathCopied, setIsPathCopied] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // Studio Mode: Player vs Trim
  const [studioTab, setStudioTab] = useState<'player' | 'trim'>('player');

  // Trimming states & controller
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isTrimming, setIsTrimming] = useState(false);
  const [isTrimmingSaving, setIsTrimmingSaving] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);
  const [trimStatusText, setTrimStatusText] = useState('');
  const abortTrimRef = useRef<boolean>(false);
  const trimWatchdogRef = useRef<any>(null);
  const trimRecorderRef = useRef<MediaRecorder | null>(null);

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

      if (isConfirmingDelete) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsConfirmingDelete(false);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          handleDelete();
          return;
        }
      }

      if (showMoreMenu && e.key === 'Escape') {
        e.preventDefault();
        setShowMoreMenu(false);
        return;
      }

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
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setPlayerVolume(prev => {
          const next = Math.min(1, Math.round((prev + 0.1) * 10) / 10);
          if (videoRef.current) {
            videoRef.current.volume = next;
            if (isMuted && next > 0) {
              setIsMuted(false);
              videoRef.current.muted = false;
            }
          }
          showToast(`Volume: ${Math.round(next * 100)}%`, 'info');
          return next;
        });
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setPlayerVolume(prev => {
          const next = Math.max(0, Math.round((prev - 0.1) * 10) / 10);
          if (videoRef.current) {
            videoRef.current.volume = next;
          }
          showToast(next === 0 ? 'Volume: Mudo' : `Volume: ${Math.round(next * 100)}%`, 'info');
          return next;
        });
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        const cur = videoRef.current ? videoRef.current.currentTime : 0;
        const nextStart = Number(cur.toFixed(1));
        setTrimStart(nextStart);
        showToast(`Ponto Inicial: ${formatTime(nextStart)} (Tecla I)`, 'info');
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        const cur = videoRef.current ? videoRef.current.currentTime : duration;
        const nextEnd = Number(cur.toFixed(1));
        setTrimEnd(nextEnd);
        showToast(`Ponto Final: ${formatTime(nextEnd)} (Tecla O)`, 'info');
      } else if (e.key === '.' || e.key === '>') {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + (1 / 30));
        }
      } else if (e.key === ',' || e.key === '<') {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - (1 / 30));
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

  const handleBackToLibrary = () => {
    window.electronAPI.openPreRecording('library');
    window.electronAPI.closeCurrentWindow();
  };

  const handleNewRecording = () => {
    window.electronAPI.openPreRecording('record');
    window.electronAPI.closeCurrentWindow();
  };

  const handleDelete = async () => {
    if (!meta) return;
    try {
      await window.electronAPI.deleteRecording(meta.id);
      window.electronAPI.openPreRecording('library');
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

      // Only loop if preview is actively playing in trim mode
      if (isTrimming && isPlaying && cur >= trimEnd) {
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

  const handleCancelTrim = () => {
    abortTrimRef.current = true;
    if (trimWatchdogRef.current) {
      clearTimeout(trimWatchdogRef.current);
      trimWatchdogRef.current = null;
    }
    if (trimRecorderRef.current && trimRecorderRef.current.state === 'recording') {
      try {
        trimRecorderRef.current.stop();
      } catch {}
    }
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsTrimmingSaving(false);
    setTrimProgress(0);
    setTrimStatusText('');
    showToast('Operação de corte cancelada.', 'info');
  };

  const handleSaveTrim = async () => {
    if (!meta || !videoRef.current) return;
    if (trimStart >= trimEnd || trimEnd <= 0) {
      showToast('O ponto inicial deve ser anterior ao ponto final.', 'error');
      return;
    }

    setIsTrimmingSaving(true);
    setTrimProgress(15);
    setTrimStatusText('Iniciando processamento...');
    abortTrimRef.current = false;

    const vid = videoRef.current;
    const prevPlaybackRate = vid.playbackRate;
    const prevMuted = vid.muted;
    const prevVolume = vid.volume;

    try {
      // Step 1: Native High-Precision FFmpeg Trimming (instantaneous, lossless, perfect sync)
      setTrimProgress(35);
      setTrimStatusText('Executando corte frame-accurate (FFmpeg)...');

      let updatedMeta: any = null;
      try {
        updatedMeta = await window.electronAPI.trimRecording(meta.id, {
          startSec: trimStart,
          endSec: trimEnd
        });
      } catch (nativeErr) {
        console.warn('Native trimming error, falling back to client recorder:', nativeErr);
      }

      if (abortTrimRef.current) return;

      if (updatedMeta && updatedMeta.id) {
        setTrimProgress(100);
        setTrimStatusText('Corte concluído com sucesso!');
        setMeta(updatedMeta);
        const newDurSec = (updatedMeta.durationMs || 1000) / 1000;
        setDuration(newDurSec);
        setTrimStart(0);
        setTrimEnd(newDurSec);
        setCurrentTime(0);
        setIsTrimming(false);

        if (vid) {
          vid.pause();
          vid.currentTime = 0;
          const cleanSrc = vid.src.split('?')[0];
          vid.src = `${cleanSrc}?t=${Date.now()}`;
          vid.load();
        }

        showToast(`Vídeo cortado e salvo com sucesso! Nova duração: ${formatTime(newDurSec)}`, 'success');
        return;
      }

      // Step 2: Fallback to client-side MediaRecorder capture
      setTrimStatusText('Processando recorte via buffer de mídia...');
      setTrimProgress(45);

      vid.pause();
      vid.playbackRate = 1.0;
      vid.currentTime = trimStart;
      vid.muted = false;
      vid.volume = Math.max(0.5, prevVolume);

      await new Promise((r) => setTimeout(r, 200));
      if (abortTrimRef.current) return;

      const stream = (vid as any).captureStream ? (vid as any).captureStream() : null;
      if (!stream) {
        showToast('Corte direto não suportado pelo navegador.', 'error');
        setIsTrimmingSaving(false);
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      trimRecorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const durationToRecord = (trimEnd - trimStart) * 1000;
      const safeRate = 1.0;
      const watchdogMs = Math.max(durationToRecord + 3000, 5000);

      recorder.start();
      vid.play();

      await new Promise<void>((resolve, reject) => {
        const startTime = Date.now();
        const check = () => {
          if (abortTrimRef.current) {
            if (trimWatchdogRef.current) clearTimeout(trimWatchdogRef.current);
            reject(new Error('Trim aborted by user'));
            return;
          }

          const elapsed = Date.now() - startTime;
          const progress = Math.min(95, 45 + Math.round((elapsed / durationToRecord) * 50));
          setTrimProgress(progress);
          setTrimStatusText(`Gravando trecho selecionado: ${Math.round((elapsed / durationToRecord) * 100)}%`);

          if (vid.currentTime >= trimEnd || vid.ended || elapsed >= durationToRecord + 1000) {
            if (trimWatchdogRef.current) clearTimeout(trimWatchdogRef.current);
            if (recorder.state === 'recording') recorder.stop();
            vid.pause();
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };

        trimWatchdogRef.current = setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
            vid.pause();
          }
          resolve();
        }, watchdogMs);

        check();
      });

      if (abortTrimRef.current) return;

      await new Promise((r) => (recorder.onstop = r as any));
      const trimmedBlob = new Blob(chunks, { type: 'video/webm' });
      const buffer = await trimmedBlob.arrayBuffer();

      setTrimProgress(95);
      setTrimStatusText('Salvando arquivo final...');

      const updated = await window.electronAPI.trimRecording(meta.id, buffer, durationToRecord);
      if (updated) {
        setMeta(updated);
        const newDurSec = (updated.durationMs || durationToRecord) / 1000;
        setDuration(newDurSec);
        setTrimStart(0);
        setTrimEnd(newDurSec);
        setCurrentTime(0);
        setIsTrimming(false);
        if (vid) {
          vid.pause();
          vid.currentTime = 0;
          const cleanSrc = vid.src.split('?')[0];
          vid.src = `${cleanSrc}?t=${Date.now()}`;
          vid.load();
        }
        showToast('Vídeo cortado e salvo com sucesso!', 'success');
      }
    } catch (e: any) {
      if (!abortTrimRef.current) {
        console.error('Error saving trim:', e);
        showToast('Erro ao salvar corte do vídeo.', 'error');
      }
    } finally {
      vid.playbackRate = prevPlaybackRate;
      vid.muted = prevMuted;
      vid.volume = prevVolume;
      trimRecorderRef.current = null;
      if (trimWatchdogRef.current) {
        clearTimeout(trimWatchdogRef.current);
        trimWatchdogRef.current = null;
      }
      setIsTrimmingSaving(false);
      setTrimProgress(0);
      setTrimStatusText('');
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
    <div className="w-full h-full min-h-screen bg-[#0B0E14] text-[#F3F5F9] flex flex-col select-none overflow-hidden font-sans">
      {/* Top Header & Breadcrumb Navigation */}
      <div className="h-16 bg-[#121722] border-b border-[#303A4B] px-6 flex items-center justify-between shrink-0">
        {/* Navigation Breadcrumb & Back Button */}
        <div className="flex items-center space-x-3 min-w-0">
          <button
            onClick={handleBackToLibrary}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#191F2B] hover:bg-[#222B39] text-[#B7C0CE] hover:text-[#78A5FF] text-xs font-semibold transition-all border border-[#303A4B] shrink-0"
            title="Voltar à Biblioteca de Gravações"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#78A5FF]" />
            <span>Biblioteca</span>
          </button>

          <span className="text-[#303A4B] font-mono text-sm hidden sm:inline">/</span>

          <div className="w-7 h-7 rounded-lg bg-[#191F2B] border border-[#303A4B] flex items-center justify-center shrink-0">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-[#78A5FF] flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-[#FF647C]" />
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
                  className="bg-[#0B0E14] border border-[#78A5FF] rounded px-2 py-0.5 text-xs text-[#F3F5F9] font-semibold focus:outline-none"
                />
                <button
                  onClick={handleSaveTitle}
                  className="text-xs bg-[#78A5FF] hover:bg-[#9AB9FF] text-[#101A32] font-bold px-2 py-0.5 rounded transition-colors"
                >
                  Salvar
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 group cursor-pointer" onClick={() => setIsEditingTitle(true)}>
                <h1 className="text-sm font-semibold text-[#F3F5F9] leading-tight truncate max-w-xs md:max-w-sm hover:text-[#78A5FF] transition-colors" title={meta?.title || 'Gravação Concluída'}>
                  {meta?.title || 'Gravação Concluída'}
                </h1>
                <Edit2 className="w-3 h-3 text-[#929CAF] group-hover:text-[#78A5FF] transition-colors shrink-0" />
              </div>
            )}

            <div className="flex items-center space-x-2 mt-0.5 text-[11px] text-[#929CAF]">
              <span>{meta ? `${formatFileSize(meta.fileSize)} • ${meta.resolution} • ${(duration).toFixed(0)}s` : ''}</span>
              <span>•</span>
              {isPublicInternetLink ? (
                <span className="inline-flex items-center space-x-1 text-[#83B8FF] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#83B8FF] inline-block" />
                  <span>Link Público Ativo</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 text-[#78A5FF] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#78A5FF] inline-block" />
                  <span>Conectando link global...</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Responsive Toolbar */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Share Link Button */}
          <button
            onClick={handleShareLink}
            title={`Copiar Link Público (${getShortcutLabel('l')})`}
            className="flex items-center space-x-1.5 bg-[#78A5FF] hover:bg-[#9AB9FF] active:scale-95 text-[#101A32] px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            {isLinkCopied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isLinkCopied ? 'Link Copiado!' : 'Copiar Link'}</span>
          </button>

          {/* Download Video */}
          <button
            onClick={handleDownload}
            className="flex items-center space-x-1.5 bg-[#191F2B] hover:bg-[#222B39] border border-[#303A4B] px-3 py-1.5 rounded-xl text-xs font-medium text-[#F3F5F9] transition-all shadow-sm"
            title="Salvar arquivo de vídeo no computador"
          >
            <Download className="w-3.5 h-3.5 text-[#83B8FF]" />
            <span className="hidden md:inline">Baixar</span>
          </button>

          {/* Open Folder */}
          <button
            onClick={handleOpenFolder}
            className="p-2 rounded-xl bg-[#191F2B] hover:bg-[#222B39] border border-[#303A4B] text-[#B7C0CE] hover:text-[#F3F5F9] transition-all shadow-sm hidden lg:flex"
            title="Abrir pasta no Windows Explorer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>

          {/* New Recording */}
          <button
            onClick={handleNewRecording}
            className="flex items-center space-x-1.5 bg-[#191F2B] hover:bg-[#222B39] border border-[#303A4B] px-3 py-1.5 rounded-xl text-xs font-medium text-[#F3F5F9] transition-all shadow-sm"
            title="Iniciar nova gravação"
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#78A5FF]" />
            <span className="hidden sm:inline">Nova Gravação</span>
          </button>

          {/* More Actions Dropdown Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2 rounded-xl bg-[#191F2B] hover:bg-[#222B39] border border-[#303A4B] text-[#B7C0CE] hover:text-[#F3F5F9] transition-all shadow-sm"
              title="Mais opções e ações do vídeo"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {showMoreMenu && (
              <div
                className="absolute right-0 top-full mt-2 w-52 bg-[#121722] border border-[#303A4B] rounded-xl shadow-2xl p-1.5 z-50 space-y-1"
                onClick={() => setShowMoreMenu(false)}
              >
                <button
                  onClick={handleOpenInBrowser}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-[#B7C0CE] hover:text-[#F3F5F9] hover:bg-[#191F2B] transition-colors text-left"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#78A5FF]" />
                  <span>Ver no Navegador</span>
                </button>
                <button
                  onClick={handleOpenFolder}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-[#B7C0CE] hover:text-[#F3F5F9] hover:bg-[#191F2B] transition-colors text-left"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#83B8FF]" />
                  <span>Abrir Pasta do Arquivo</span>
                </button>
                <button
                  onClick={() => {
                    if (meta?.filePath) {
                      navigator.clipboard.writeText(meta.filePath);
                      setIsPathCopied(true);
                      showToast('Caminho do arquivo copiado!', 'success');
                      setTimeout(() => setIsPathCopied(false), 2000);
                    }
                  }}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-[#B7C0CE] hover:text-[#F3F5F9] hover:bg-[#191F2B] transition-colors text-left"
                >
                  <Copy className="w-3.5 h-3.5 text-[#929CAF]" />
                  <span>Copiar Caminho no Disco</span>
                </button>
                <div className="border-t border-[#303A4B] my-1" />
                <button
                  onClick={() => setIsConfirmingDelete(true)}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-[#FF647C] hover:bg-[#B83A48]/20 transition-colors text-left font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Gravação</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Share Link Banner Alert */}
      <div className="bg-[#121722] border-b border-[#303A4B] px-6 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2 truncate">
          <Globe className="w-3.5 h-3.5 text-[#78A5FF] shrink-0" />
          <span className="text-[#B7C0CE]">Link de compartilhamento para qualquer pessoa assistir:</span>
          <span className="font-mono text-[#78A5FF] font-semibold select-all truncate max-w-lg">
            {shareUrl || 'Gerando link público...'}
          </span>
        </div>
        <button
          onClick={handleShareLink}
          title={`Copiar Link (${getShortcutLabel('l')})`}
          className="text-xs text-[#78A5FF] hover:text-[#9AB9FF] hover:underline font-semibold shrink-0 ml-4"
        >
          {isLinkCopied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>

      {/* Main Content Area: Video Player & Editor */}
      <div className="flex-1 flex flex-col p-6 items-center justify-start max-w-5xl mx-auto w-full overflow-y-auto">
        {/* Studio Mode Switcher (Apple HIG Segmented Control) */}
        <div className="w-full flex items-center justify-between mb-3 shrink-0">
          <div className="inline-flex p-1 bg-[#121722] border border-[#303A4B] rounded-xl shadow-inner">
            <button
              onClick={() => setStudioTab('player')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                studioTab === 'player'
                  ? 'bg-[#78A5FF] text-[#101A32] shadow-sm'
                  : 'text-[#929CAF] hover:text-[#F3F5F9]'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Assistir & Capítulos</span>
            </button>
            <button
              onClick={() => {
                setStudioTab('trim');
                setIsTrimming(true);
                if (trimEnd === 0 && duration > 0) setTrimEnd(duration);
                document.getElementById('trim-studio-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                studioTab === 'trim'
                  ? 'bg-[#78A5FF] text-[#101A32] shadow-sm'
                  : 'text-[#929CAF] hover:text-[#F3F5F9]'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Estúdio de Corte</span>
            </button>
          </div>
          <div className="text-xs text-[#929CAF] font-mono hidden sm:block">
            Duração Total: <span className="text-[#F3F5F9] font-bold">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Video Player Container */}
        <div className="relative w-full aspect-video max-h-[50vh] bg-black rounded-2xl overflow-hidden border border-[#303A4B] shadow-2xl flex items-center justify-center group shrink-0">
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
            <div className="flex flex-col items-center justify-center text-[#929CAF] space-y-2">
              <Play className="w-12 h-12 text-[#929CAF]" />
              <span className="text-sm">Carregando visualização do vídeo...</span>
            </div>
          )}

          {/* Big Play Button Overlay when Paused */}
          {!isPlaying && meta?.filePath && (
            <button
              onClick={togglePlay}
              title="Reproduzir (Espaço)"
              className="absolute w-16 h-16 rounded-full bg-[#78A5FF] text-[#101A32] flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all hover:bg-[#9AB9FF]"
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
                className="w-full h-1.5 bg-white/20 accent-[#78A5FF] rounded-lg cursor-pointer appearance-none"
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

                <span className="text-xs font-mono font-medium text-[#F3F5F9]">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Speed & Volume & Fullscreen */}
              <div className="flex items-center space-x-3">
                {/* Speed Multiplier */}
                <button
                  onClick={handleSpeedChange}
                  title="Alternar Velocidade (1x, 1.25x, 1.5x, 2x) ou Teclas 1, 2, 3, 4"
                  className="text-xs font-bold bg-[#191F2B] hover:bg-[#222B39] border border-[#303A4B] px-2 py-1 rounded-lg text-[#78A5FF] transition-colors font-mono"
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
                      <VolumeX className="w-4 h-4 text-[#FF647C]" />
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
                    className="w-16 h-1 bg-white/20 hover:bg-white/40 rounded-lg appearance-none cursor-pointer accent-[#78A5FF] transition-opacity"
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
        <div className="w-full mt-4 bg-[#121722] border border-[#303A4B] rounded-2xl p-4 shadow-xl flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-[#78A5FF]" />
              <span className="text-xs font-bold text-[#F3F5F9] tracking-wide uppercase">
                Linha do Tempo com Waveform Real
              </span>
              {isLoadingWaveform && (
                <span className="text-[10px] text-[#929CAF] animate-pulse">
                  (decodificando áudio...)
                </span>
              )}
            </div>
            <div className="flex items-center space-x-3 text-xs font-mono">
              <span className="text-[#78A5FF] font-bold">{formatTime(currentTime)}</span>
              <span className="text-[#929CAF]">/</span>
              <span className="text-[#B7C0CE]">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Interactive Waveform Canvas Container */}
          <div
            className="relative h-16 w-full bg-[#0B0E14] rounded-xl overflow-hidden border border-[#303A4B] cursor-pointer flex items-center px-1"
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

                let barColor = 'bg-[#191F2B]';
                if (isInsideTrim) {
                  barColor = isPlayed
                    ? 'bg-[#78A5FF] shadow-sm shadow-[#78A5FF]/30'
                    : 'bg-[#303A4B] hover:bg-[#222B39]';
                } else {
                  barColor = 'bg-[#191F2B]/30';
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
              className="absolute top-0 bottom-0 w-0.5 bg-[#78A5FF] shadow-[0_0_8px_rgba(120,165,255,0.7)] pointer-events-none transition-all duration-75"
              style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            >
              <div className="w-2.5 h-2.5 -ml-1 rounded-full bg-[#78A5FF] shadow-sm" />
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
                  className="absolute top-0 bottom-0 w-1 bg-[#F2B66D] hover:bg-[#F2B66D] hover:w-1.5 transition-all z-20 group cursor-pointer"
                  style={{ left: `${leftPct}%` }}
                >
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 bg-[#F2B66D] text-[#2B0E13] font-bold text-[10px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap pointer-events-none transition-opacity">
                    {chap.title} ({formatTime(chap.time)})
                  </div>
                </div>
              );
            })}

            {/* Trim Boundary Overlays */}
            {isTrimming && (
              <>
                <div
                  className="absolute top-0 bottom-0 left-0 bg-black/60 pointer-events-none border-r-2 border-[#78A5FF]"
                  style={{ width: `${duration > 0 ? (trimStart / duration) * 100 : 0}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 right-0 bg-black/60 pointer-events-none border-l-2 border-[#78A5FF]"
                  style={{ width: `${duration > 0 ? Math.max(0, (1 - trimEnd / duration) * 100) : 0}%` }}
                />
              </>
            )}
          </div>
        </div>

        {/* Trimming & Video Editing Studio Controls */}
        <div
          id="trim-studio-section"
          className={`w-full mt-4 bg-[#121722] border ${
            studioTab === 'trim' ? 'border-[#78A5FF] ring-2 ring-[#78A5FF]/30' : 'border-[#303A4B]'
          } rounded-xl p-4 flex flex-col gap-3 shrink-0 shadow-lg transition-all`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#191F2B] border border-[#303A4B] flex items-center justify-center shrink-0">
                <Scissors className="w-4 h-4 text-[#78A5FF]" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-[#F3F5F9]">Corte Preciso de Vídeo</span>
                  <span className="text-[10px] bg-[#1A2A47] text-[#78A5FF] border border-[#78A5FF]/30 px-2 py-0.5 rounded-full font-mono font-bold">
                    Duração: {Math.max(0, trimEnd - trimStart).toFixed(1)}s
                  </span>
                  {trimStart > 0 || trimEnd < duration ? (
                    <span className="text-[10px] bg-[#FF647C]/10 text-[#FF647C] border border-[#FF647C]/30 px-1.5 py-0.5 rounded-full font-mono">
                      -{Math.max(0, duration - (trimEnd - trimStart)).toFixed(1)}s removidos
                    </span>
                  ) : null}
                </div>
                <span className="text-[11px] text-[#929CAF]">Selecione os pontos inicial e final para recortar sem perda de qualidade</span>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              <div className="flex items-center space-x-1.5 text-xs bg-[#191F2B] border border-[#303A4B] px-2 py-1 rounded-lg">
                <span className="text-[#929CAF]">Início:</span>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, trimEnd - 0.1)}
                  step={0.1}
                  value={Number(trimStart.toFixed(1))}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(Number(e.target.value), trimEnd - 0.1));
                    setTrimStart(val);
                    if (videoRef.current) videoRef.current.currentTime = val;
                  }}
                  className="w-14 bg-[#0B0E14] border border-[#303A4B] rounded px-1.5 py-0.5 text-[#F3F5F9] font-mono text-xs focus:border-[#78A5FF] outline-none text-center"
                />
                <button
                  type="button"
                  onClick={() => {
                    const point = Math.max(0, Math.min(currentTime, trimEnd - 0.1));
                    setTrimStart(Number(point.toFixed(1)));
                    showToast(`Início marcado em: ${formatTime(point)} (I)`, 'info');
                  }}
                  title="Marcar início no segundo atual do player (Atalho: Tecla I)"
                  className="px-1.5 py-0.5 text-[10px] font-semibold bg-[#222B39] hover:bg-[#303A4B] text-[#78A5FF] hover:text-[#9AB9FF] rounded transition-colors"
                >
                  Cursor (I)
                </button>
              </div>

              <div className="flex items-center space-x-1.5 text-xs bg-[#191F2B] border border-[#303A4B] px-2 py-1 rounded-lg">
                <span className="text-[#929CAF]">Fim:</span>
                <input
                  type="number"
                  min={Math.min(duration, trimStart + 0.1)}
                  max={duration}
                  step={0.1}
                  value={Number(trimEnd.toFixed(1))}
                  onChange={(e) => {
                    const val = Math.min(duration, Math.max(Number(e.target.value), trimStart + 0.1));
                    setTrimEnd(val);
                  }}
                  className="w-14 bg-[#0B0E14] border border-[#303A4B] rounded px-1.5 py-0.5 text-[#F3F5F9] font-mono text-xs focus:border-[#78A5FF] outline-none text-center"
                />
                <button
                  type="button"
                  onClick={() => {
                    const point = Math.min(duration, Math.max(currentTime, trimStart + 0.1));
                    setTrimEnd(Number(point.toFixed(1)));
                    showToast(`Fim marcado em: ${formatTime(point)} (O)`, 'info');
                  }}
                  title="Marcar fim no segundo atual do player (Atalho: Tecla O)"
                  className="px-1.5 py-0.5 text-[10px] font-semibold bg-[#222B39] hover:bg-[#303A4B] text-[#78A5FF] hover:text-[#9AB9FF] rounded transition-colors"
                >
                  Cursor (O)
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setTrimStart(0);
                  setTrimEnd(duration);
                  showToast('Seleção de corte resetada para o vídeo inteiro.', 'info');
                }}
                title="Resetar seleção para todo o vídeo"
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-[#191F2B] hover:bg-[#222B39] border border-[#303A4B] text-[#B7C0CE] hover:text-[#F3F5F9] transition-colors"
              >
                Resetar
              </button>

              <button
                onClick={() => {
                  const nextState = !isTrimming;
                  setIsTrimming(nextState);
                  if (nextState && videoRef.current) {
                    videoRef.current.currentTime = trimStart;
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isTrimming
                    ? 'bg-[#F2B66D] text-[#2B0E13] font-bold shadow-md shadow-[#F2B66D]/20'
                    : 'bg-[#191F2B] border border-[#303A4B] text-[#B7C0CE] hover:text-[#F3F5F9]'
                }`}
              >
                {isTrimming ? 'Loop Trecho Ativo' : 'Testar Trecho'}
              </button>

              <button
                onClick={handleSaveTrim}
                disabled={isTrimmingSaving || (trimStart === 0 && trimEnd === duration)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#FF647C] hover:bg-[#FF647C]/90 disabled:opacity-40 disabled:cursor-not-allowed text-[#2B0E13] shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <span>{isTrimmingSaving ? 'Cortando...' : 'Salvar Corte'}</span>
              </button>
            </div>
          </div>

          {/* Real-time Progress & Cancel Bar when saving */}
          {isTrimmingSaving && (
            <div className="w-full pt-3 mt-1 border-t border-[#303A4B] flex flex-col space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#83B8FF] font-medium flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#83B8FF] animate-pulse" />
                  <span>{trimStatusText || 'Processando corte de vídeo com alta precisão...'}</span>
                </span>
                <span className="font-mono text-[#F3F5F9] font-bold">{trimProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-[#191F2B] rounded-full overflow-hidden border border-[#303A4B]">
                <div
                  className="h-full bg-gradient-to-r from-[#78A5FF] to-[#83B8FF] transition-all duration-300"
                  style={{ width: `${trimProgress}%` }}
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleCancelTrim}
                  className="px-3 py-1 text-xs text-[#FF647C] hover:text-[#FFFFFF] hover:bg-[#B83A48] rounded-lg border border-[#FF647C]/30 transition-colors font-medium"
                >
                  Cancelar Corte
                </button>
              </div>
            </div>
          )}
        </div>

        {/* AI Summary, Chapters & Transcript 3-Column Studio Grid */}
        <div className="w-full mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 pb-6 shrink-0">
          {/* AI Summary Card */}
          <div className="bg-[#121722] border border-[#303A4B] rounded-xl p-4 space-y-2">
            <div className="flex items-center space-x-2 text-[#78A5FF] text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Resumo Inteligente</span>
            </div>
            <p className="text-xs text-[#B7C0CE] leading-relaxed whitespace-pre-line max-h-48 overflow-y-auto">
              {meta?.aiSummary || 'Explicação gravada com sucesso pelo Aura Screen Studio.'}
            </p>
          </div>

          {/* Interactive Chapters Card */}
          <div className="bg-[#121722] border border-[#303A4B] rounded-xl p-4 space-y-3 flex flex-col max-h-56">
            <div className="flex items-center justify-between text-[#78A5FF] text-xs font-bold uppercase tracking-wider">
              <div className="flex items-center space-x-1.5">
                <Bookmark className="w-4 h-4" />
                <span>Capítulos ({chapters.length})</span>
              </div>
              <button
                onClick={handleSaveChapters}
                disabled={isSavingChapters}
                className="text-[10px] bg-[#78A5FF] hover:bg-[#9AB9FF] text-[#101A32] px-2 py-0.5 rounded-lg font-bold transition-colors shadow-sm"
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
                className="flex-1 bg-[#191F2B] border border-[#303A4B] rounded-lg px-2 py-1 text-xs text-[#F3F5F9] placeholder-[#929CAF] outline-none focus:border-[#78A5FF]"
              />
              <button
                onClick={handleAddChapterAtCurrentTime}
                className="flex items-center space-x-1 bg-[#78A5FF] hover:bg-[#9AB9FF] text-[#101A32] px-2 py-1 rounded-lg text-xs font-bold shrink-0 transition-colors"
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
                    className="flex items-center space-x-2 bg-[#191F2B] hover:bg-[#222B39] border border-[#303A4B] p-1.5 rounded-lg transition-colors group"
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
                      className="font-mono text-[#78A5FF] hover:text-[#101A32] bg-[#1A2A47] hover:bg-[#78A5FF] px-1.5 py-0.5 rounded text-[11px] font-bold shrink-0 transition-colors"
                      title="Pular para este segundo"
                    >
                      {formatTime(chap.time)}
                    </button>
                    <input
                      type="text"
                      value={chap.title}
                      onChange={(e) => handleUpdateChapterTitle(chap.id, e.target.value)}
                      className="flex-1 bg-transparent text-xs text-[#F3F5F9] focus:text-white outline-none border-b border-transparent focus:border-[#78A5FF]"
                    />
                    <button
                      onClick={() => handleRemoveChapter(chap.id)}
                      className="opacity-0 group-hover:opacity-100 text-[#929CAF] hover:text-[#FF647C] p-1 transition-all"
                      title="Remover capítulo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#929CAF] italic pt-1">
                  Nenhum capítulo salvo. Adicione marcadores no segundo desejado!
                </p>
              )}
            </div>
          </div>

          {/* Transcript / Spoken Timeline */}
          <div className="bg-[#121722] border border-[#303A4B] rounded-xl p-4 space-y-2 max-h-56 overflow-y-auto">
            <div className="flex items-center justify-between text-[#78A5FF] text-xs font-bold uppercase tracking-wider">
              <span>Transcrição</span>
              <span className="text-[10px] text-[#929CAF] font-normal">
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
                    className="p-1.5 rounded-lg hover:bg-[#191F2B] cursor-pointer transition-colors flex items-start space-x-2 text-xs"
                  >
                    <span className="font-mono text-[#78A5FF] font-bold shrink-0">
                      {formatTime(item.time)}
                    </span>
                    <span className="text-[#B7C0CE]">{item.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#929CAF] italic pt-2">
                Nenhuma fala capturada durante esta gravação.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Non-blocking Delete Confirmation Modal */}
      {isConfirmingDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121722] border border-[#FF647C]/40 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <div className="w-10 h-10 rounded-full bg-[#FF647C]/20 border border-[#FF647C]/40 flex items-center justify-center mx-auto text-[#FF647C]">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#F3F5F9]">Excluir Gravação?</h3>
              <p className="text-xs text-[#B7C0CE] mt-1">
                O arquivo de vídeo será removido permanentemente do disco. Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-1">
              <button
                onClick={() => setIsConfirmingDelete(false)}
                className="flex-1 py-2 px-3 bg-[#191F2B] hover:bg-[#222B39] text-[#B7C0CE] text-xs font-semibold rounded-xl border border-[#303A4B] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 px-3 bg-[#B83A48] hover:bg-[#A83240] text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking Toast Notification */}
      {toast && (
        <div className="fixed top-14 right-6 z-50 flex items-center space-x-2 px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-medium bg-[#121722]/95 backdrop-blur-md border-[#78A5FF]/40 text-[#F3F5F9] animate-in fade-in">
          {toast.type === 'success' && <Check className="w-4 h-4 text-[#83B8FF] shrink-0" />}
          {toast.type === 'error' && <Trash2 className="w-4 h-4 text-[#FF647C] shrink-0" />}
          {toast.type === 'info' && <Sparkles className="w-4 h-4 text-[#78A5FF] shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};
