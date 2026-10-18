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
  MoreHorizontal,
  Palette,
  Camera,
  ZoomIn,
  ZoomOut,
  Mic,
  Sliders,
  Layers,
  Monitor,
  Smartphone,
  Square,
  LayoutTemplate,
  Keyboard,
  HelpCircle
} from 'lucide-react';
import { RecordingMeta, ChapterItem } from '../types';
import confetti from 'canvas-confetti';
import { getShortcutLabel } from '../utils/shortcuts';
import {
  VOICE_PRESENCE_PARAMS,
  DE_ESSER_PARAMS,
  STUDIO_WARMTH_PARAMS,
  STUDIO_LIMITER_PARAMS
} from '../utils/audioDsp';

export type CanvasBackdrop = 'nocturne' | 'sunset' | 'cyberpunk' | 'emerald' | 'frosted' | 'none';
export type CanvasAspectRatio = '16-9' | '9-16' | '1-1' | '4-3';
export type FrameShadowStyle = 'none' | 'subtle' | 'cinematic' | 'glow';
export type ZoomFocusPoint = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface BackdropPreset {
  id: CanvasBackdrop;
  name: string;
  gradient: string;
  dotColor: string;
  desc: string;
}

const BACKDROP_PRESETS: BackdropPreset[] = [
  { id: 'nocturne', name: 'Nocturne Obsidian', gradient: 'bg-gradient-to-br from-[#0B0E14] via-[#121722] to-[#1A2A47]', dotColor: '#78A5FF', desc: 'Assinatura Aura em tons índigo e obsidiana profunda' },
  { id: 'sunset', name: 'Sunset Aura', gradient: 'bg-gradient-to-br from-[#2B0E13] via-[#4A1525] to-[#1A2A47]', dotColor: '#FF647C', desc: 'Gradiente carmesim e crepúsculo cinematográfico' },
  { id: 'cyberpunk', name: 'Neon Cyberpunk', gradient: 'bg-gradient-to-br from-[#0B1426] via-[#1E1B4B] to-[#3B0764]', dotColor: '#A855F7', desc: 'Roxo elétrico e azul profundo de alta energia' },
  { id: 'emerald', name: 'Emerald Forest', gradient: 'bg-gradient-to-br from-[#062419] via-[#0F382C] to-[#0B0E14]', dotColor: '#10B981', desc: 'Verde esmeralda sofisticado para tutoriais e código' },
  { id: 'frosted', name: 'Frosted Glass', gradient: 'bg-[#121722]/90 backdrop-blur-xl border border-[#303A4B]', dotColor: '#929CAF', desc: 'Vidro jateado moderno com acabamento Apple' },
  { id: 'none', name: 'Preto Puro (Flat)', gradient: 'bg-black', dotColor: '#303A4B', desc: 'Fundo preto neutro sem moldura externa' }
];

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
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // Studio Mode: Player vs Canvas vs Trim
  const [studioTab, setStudioTab] = useState<'player' | 'canvas' | 'trim'>('player');

  // Screen Studio Presentation Canvas & Window Frame state
  const [canvasBackdrop, setCanvasBackdrop] = useState<CanvasBackdrop>(() => {
    return (localStorage.getItem('aura_canvas_backdrop') as CanvasBackdrop) || 'nocturne';
  });
  const [canvasPadding, setCanvasPadding] = useState<number>(() => {
    const s = localStorage.getItem('aura_canvas_padding');
    return s !== null ? Number(s) : 6;
  });
  const [frameRadius, setFrameRadius] = useState<number>(() => {
    const s = localStorage.getItem('aura_canvas_radius');
    return s !== null ? Number(s) : 16;
  });
  const [frameShadow, setFrameShadow] = useState<FrameShadowStyle>(() => {
    return (localStorage.getItem('aura_canvas_shadow') as FrameShadowStyle) || 'cinematic';
  });
  const [hasWindowHeader, setHasWindowHeader] = useState<boolean>(() => {
    return localStorage.getItem('aura_canvas_header') !== 'false';
  });
  const [aspectRatio, setAspectRatio] = useState<CanvasAspectRatio>(() => {
    return (localStorage.getItem('aura_canvas_ratio') as CanvasAspectRatio) || '16-9';
  });

  // Cinematic Smooth Zoom & Pan Engine state
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [zoomFocus, setZoomFocus] = useState<ZoomFocusPoint>('center');

  // Descript-Style Studio Voice Engine states
  const [isStudioVoice, setIsStudioVoice] = useState<boolean>(() => {
    return localStorage.getItem('aura_studio_voice') === 'true';
  });
  const studioAudioCtxRef = useRef<AudioContext | null>(null);
  const studioSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const studioVoiceFilterRef = useRef<BiquadFilterNode | null>(null);
  const studioDeEsserRef = useRef<BiquadFilterNode | null>(null);
  const studioWarmthRef = useRef<BiquadFilterNode | null>(null);
  const studioCompressorRef = useRef<DynamicsCompressorNode | null>(null);

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

      if (isShortcutsModalOpen && (e.key === 'Escape' || e.key === 'Enter')) {
        e.preventDefault();
        setIsShortcutsModalOpen(false);
        return;
      }

      if (showMoreMenu && e.key === 'Escape') {
        e.preventDefault();
        setShowMoreMenu(false);
        return;
      }

      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsShortcutsModalOpen(prev => !prev);
        return;
      }

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
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleCaptureFrame();
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        cycleZoom();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        toggleStudioVoice();
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

  useEffect(() => {
    localStorage.setItem('aura_canvas_backdrop', canvasBackdrop);
  }, [canvasBackdrop]);

  useEffect(() => {
    localStorage.setItem('aura_canvas_padding', String(canvasPadding));
  }, [canvasPadding]);

  useEffect(() => {
    localStorage.setItem('aura_canvas_radius', String(frameRadius));
  }, [frameRadius]);

  useEffect(() => {
    localStorage.setItem('aura_canvas_shadow', frameShadow);
  }, [frameShadow]);

  useEffect(() => {
    localStorage.setItem('aura_canvas_header', String(hasWindowHeader));
  }, [hasWindowHeader]);

  useEffect(() => {
    localStorage.setItem('aura_canvas_ratio', aspectRatio);
  }, [aspectRatio]);

  const getZoomOrigin = (focus: ZoomFocusPoint) => {
    switch (focus) {
      case 'top-left': return '15% 15%';
      case 'top-right': return '85% 15%';
      case 'bottom-left': return '15% 85%';
      case 'bottom-right': return '85% 85%';
      default: return '50% 50%';
    }
  };

  const cycleZoom = () => {
    const scales = [1.0, 1.4, 1.8, 2.2];
    const nextIdx = (scales.indexOf(zoomScale) + 1) % scales.length;
    const nextScale = scales[nextIdx];
    setZoomScale(nextScale);
    showToast(`Zoom Studio: ${nextScale}x`, 'info');
  };

  const getShadowClass = (shadow: FrameShadowStyle) => {
    switch (shadow) {
      case 'none': return 'shadow-none border border-[#303A4B]/60';
      case 'subtle': return 'shadow-xl shadow-black/50 border border-[#303A4B]';
      case 'cinematic': return 'shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] ring-1 ring-white/10';
      case 'glow': return 'shadow-[0_20px_55px_-10px_rgba(120,165,255,0.45)] ring-1 ring-[#78A5FF]/40';
      default: return 'shadow-2xl';
    }
  };

  const currentBackdrop = BACKDROP_PRESETS.find(b => b.id === canvasBackdrop) || BACKDROP_PRESETS[0];

  const handleCaptureFrame = async () => {
    if (!videoRef.current || videoRef.current.videoWidth === 0) {
      showToast('Aguarde o vídeo carregar para capturar o frame.', 'error');
      return;
    }
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');

      if (studioTab === 'canvas') {
        // Render Full Screen Studio Framed Presentation Canvas!
        let outW = 1920;
        let outH = 1080;
        if (aspectRatio === '9-16') {
          outW = 1080;
          outH = 1920;
        } else if (aspectRatio === '1-1') {
          outW = 1440;
          outH = 1440;
        } else if (aspectRatio === '4-3') {
          outW = 1600;
          outH = 1200;
        }

        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 1. Draw Backdrop Gradient
        const grad = ctx.createLinearGradient(0, 0, outW, outH);
        if (canvasBackdrop === 'nocturne') {
          grad.addColorStop(0, '#0B0E14');
          grad.addColorStop(0.5, '#121722');
          grad.addColorStop(1, '#1A2A47');
        } else if (canvasBackdrop === 'sunset') {
          grad.addColorStop(0, '#2B0E13');
          grad.addColorStop(0.5, '#4A1525');
          grad.addColorStop(1, '#1A2A47');
        } else if (canvasBackdrop === 'cyberpunk') {
          grad.addColorStop(0, '#0B1426');
          grad.addColorStop(0.5, '#1E1B4B');
          grad.addColorStop(1, '#3B0764');
        } else if (canvasBackdrop === 'emerald') {
          grad.addColorStop(0, '#062419');
          grad.addColorStop(0.5, '#0F382C');
          grad.addColorStop(1, '#0B0E14');
        } else if (canvasBackdrop === 'frosted') {
          grad.addColorStop(0, '#191F2B');
          grad.addColorStop(1, '#121722');
        } else {
          grad.addColorStop(0, '#000000');
          grad.addColorStop(1, '#000000');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, outW, outH);

        // 2. Compute Inset Window Rect
        const padRatio = (canvasPadding * 2) / 100;
        const padX = Math.round(outW * padRatio);
        const padY = Math.round(outH * padRatio);
        const winX = padX;
        const winY = padY;
        const winW = outW - 2 * padX;
        const winH = outH - 2 * padY;
        const rad = Math.min(frameRadius * 2, 48);

        // 3. Draw Shadow
        if (frameShadow !== 'none') {
          ctx.save();
          if (frameShadow === 'glow') {
            ctx.shadowColor = 'rgba(120, 165, 255, 0.5)';
            ctx.shadowBlur = 60;
            ctx.shadowOffsetY = 15;
          } else if (frameShadow === 'cinematic') {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
            ctx.shadowBlur = 50;
            ctx.shadowOffsetY = 25;
          } else {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 30;
            ctx.shadowOffsetY = 10;
          }
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.roundRect(winX, winY, winW, winH, rad);
          ctx.fill();
          ctx.restore();
        }

        // 4. Clip Window Container
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(winX, winY, winW, winH, rad);
        ctx.clip();

        // Background of window
        ctx.fillStyle = '#0B0E14';
        ctx.fillRect(winX, winY, winW, winH);

        let videoAreaY = winY;
        let videoAreaH = winH;

        // 5. Header / macOS Titlebar
        if (hasWindowHeader) {
          const headerH = 46;
          ctx.fillStyle = '#121722';
          ctx.fillRect(winX, winY, winW, headerH);
          ctx.strokeStyle = '#303A4B';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(winX, winY + headerH);
          ctx.lineTo(winX + winW, winY + headerH);
          ctx.stroke();

          // Traffic light dots
          const dotY = winY + headerH / 2;
          ctx.fillStyle = '#FF5F56';
          ctx.beginPath();
          ctx.arc(winX + 24, dotY, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FFBD2E';
          ctx.beginPath();
          ctx.arc(winX + 44, dotY, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#27C93F';
          ctx.beginPath();
          ctx.arc(winX + 64, dotY, 6, 0, Math.PI * 2);
          ctx.fill();

          // Title text
          ctx.fillStyle = '#B7C0CE';
          ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const titleStr = meta?.title || 'Aura Screen Studio';
          ctx.fillText(titleStr, winX + winW / 2, dotY);

          videoAreaY += headerH;
          videoAreaH -= headerH;
        }

        // 6. Draw video frame centered inside videoArea
        const videoRatio = video.videoWidth / video.videoHeight;
        const areaRatio = winW / videoAreaH;
        let drawW = winW;
        let drawH = videoAreaH;
        let drawX = winX;
        let drawY = videoAreaY;

        if (videoRatio > areaRatio) {
          drawW = winW;
          drawH = winW / videoRatio;
          drawY = videoAreaY + (videoAreaH - drawH) / 2;
        } else {
          drawH = videoAreaH;
          drawW = videoAreaH * videoRatio;
          drawX = winX + (winW - drawW) / 2;
        }

        ctx.drawImage(video, drawX, drawY, drawW, drawH);
        ctx.restore();
      } else {
        // Raw native video frame
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          showToast(
            studioTab === 'canvas'
              ? `🎨 Mockup Screen Studio copiado (${canvas.width}x${canvas.height})!`
              : `📸 Frame copiado em resolução nativa (${canvas.width}x${canvas.height})!`,
            'success'
          );
          confetti({ particleCount: 35, spread: 50, origin: { y: 0.8 } });
        } catch (clipErr) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Aura_Studio_${studioTab === 'canvas' ? 'Mockup_' : 'Frame_'}${formatTime(currentTime).replace(':', '_')}.png`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('📸 Frame salvo em arquivo PNG!', 'success');
        }
      }, 'image/png');
    } catch (err) {
      console.error('Frame capture failed:', err);
      showToast('Erro ao capturar frame.', 'error');
    }
  };

  const toggleStudioVoice = async () => {
    const next = !isStudioVoice;
    setIsStudioVoice(next);
    localStorage.setItem('aura_studio_voice', String(next));

    if (!studioAudioCtxRef.current && videoRef.current) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        studioAudioCtxRef.current = ctx;

        if (!studioSourceNodeRef.current) {
          studioSourceNodeRef.current = ctx.createMediaElementSource(videoRef.current);
        }

        const warmth = ctx.createBiquadFilter();
        warmth.type = 'highpass';
        warmth.frequency.value = STUDIO_WARMTH_PARAMS.frequency;
        warmth.Q.value = STUDIO_WARMTH_PARAMS.Q;
        studioWarmthRef.current = warmth;

        const presence = ctx.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = VOICE_PRESENCE_PARAMS.frequency;
        presence.gain.value = next ? VOICE_PRESENCE_PARAMS.gain : 0;
        presence.Q.value = VOICE_PRESENCE_PARAMS.Q;
        studioVoiceFilterRef.current = presence;

        const deEsser = ctx.createBiquadFilter();
        deEsser.type = 'peaking';
        deEsser.frequency.value = DE_ESSER_PARAMS.frequency;
        deEsser.gain.value = next ? DE_ESSER_PARAMS.gain : 0;
        deEsser.Q.value = DE_ESSER_PARAMS.Q;
        studioDeEsserRef.current = deEsser;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = next ? STUDIO_LIMITER_PARAMS.threshold : 0;
        comp.knee.value = STUDIO_LIMITER_PARAMS.knee;
        comp.ratio.value = next ? STUDIO_LIMITER_PARAMS.ratio : 1.0;
        comp.attack.value = STUDIO_LIMITER_PARAMS.attack;
        comp.release.value = STUDIO_LIMITER_PARAMS.release;
        studioCompressorRef.current = comp;

        studioSourceNodeRef.current.connect(warmth);
        warmth.connect(presence);
        presence.connect(deEsser);
        deEsser.connect(comp);
        comp.connect(ctx.destination);
      } catch (err) {
        console.warn('Web Audio initialization fallback:', err);
      }
    }

    if (studioAudioCtxRef.current && studioAudioCtxRef.current.state === 'suspended') {
      await studioAudioCtxRef.current.resume().catch(() => {});
    }

    const t = studioAudioCtxRef.current?.currentTime || 0;
    if (studioVoiceFilterRef.current) {
      studioVoiceFilterRef.current.gain.setValueAtTime(next ? VOICE_PRESENCE_PARAMS.gain : 0, t);
    }
    if (studioDeEsserRef.current) {
      studioDeEsserRef.current.gain.setValueAtTime(next ? DE_ESSER_PARAMS.gain : 0, t);
    }
    if (studioCompressorRef.current) {
      studioCompressorRef.current.threshold.setValueAtTime(next ? STUDIO_LIMITER_PARAMS.threshold : 0, t);
      studioCompressorRef.current.ratio.setValueAtTime(next ? STUDIO_LIMITER_PARAMS.ratio : 1.0, t);
    }

    if (next) {
      showToast('🎙️ Voz de Estúdio Ativada: Presença Vocal (+3.5 dB) e De-Esser', 'success');
    } else {
      showToast('Voz de Estúdio Desativada (Áudio Original)', 'info');
    }
  };

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
    <div className="w-full h-full bg-[#0B0E14] text-[#F3F5F9] flex flex-col select-none overflow-hidden font-sans">
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

          {/* Shortcuts Help Guide */}
          <button
            onClick={() => setIsShortcutsModalOpen(true)}
            className="p-2 rounded-xl bg-[#191F2B] hover:bg-[#222B39] border border-[#303A4B] text-[#B7C0CE] hover:text-[#78A5FF] transition-all shadow-sm"
            title="Guia de Atalhos do Studio (Tecla ?)"
          >
            <Keyboard className="w-3.5 h-3.5" />
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
              onClick={() => setStudioTab('canvas')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                studioTab === 'canvas'
                  ? 'bg-[#78A5FF] text-[#101A32] shadow-sm'
                  : 'text-[#929CAF] hover:text-[#F3F5F9]'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Moldura & Canvas Studio</span>
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
          <div className="flex items-center space-x-3 text-xs text-[#929CAF] font-mono hidden sm:flex">
            {isStudioVoice && (
              <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-[#1A2A47] text-[#78A5FF] border border-[#78A5FF]/40 text-[11px] font-sans font-semibold">
                <Mic className="w-3 h-3" />
                <span>Voz de Estúdio ON</span>
              </span>
            )}
            <span>Duração Total: <strong className="text-[#F3F5F9] font-bold">{formatTime(duration)}</strong></span>
          </div>
        </div>

        {/* Presentation Canvas Wrapper */}
        <div
          className={`w-full flex items-center justify-center transition-all duration-300 ${
            studioTab === 'canvas'
              ? `${currentBackdrop.gradient} rounded-3xl border border-[#303A4B]/60 shadow-2xl p-6 sm:p-8 min-h-[380px] max-h-[56vh]`
              : 'bg-transparent'
          }`}
        >
          {/* Framed Window */}
          <div
            className={`relative w-full overflow-hidden flex flex-col transition-all duration-300 ${
              studioTab === 'canvas'
                ? `${getShadowClass(frameShadow)}`
                : 'aspect-video max-h-[50vh] bg-black rounded-2xl border border-[#303A4B] shadow-2xl'
            }`}
            style={
              studioTab === 'canvas'
                ? {
                    borderRadius: `${frameRadius}px`,
                    maxWidth:
                      aspectRatio === '9-16'
                        ? '320px'
                        : aspectRatio === '1-1'
                        ? '440px'
                        : aspectRatio === '4-3'
                        ? '540px'
                        : '100%',
                    aspectRatio:
                      aspectRatio === '16-9'
                        ? '16 / 9'
                        : aspectRatio === '9-16'
                        ? '9 / 16'
                        : aspectRatio === '1-1'
                        ? '1 / 1'
                        : '4 / 3'
                  }
                : undefined
            }
          >
            {/* macOS Window Titlebar Header (when enabled in Canvas mode) */}
            {studioTab === 'canvas' && hasWindowHeader && (
              <div className="h-8 bg-[#121722]/95 border-b border-[#303A4B]/80 px-3.5 flex items-center justify-between shrink-0 select-none">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] border border-[#E0443E]/60 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] border border-[#DEA123]/60 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F] border border-[#1AAB29]/60 inline-block" />
                </div>
                <div className="text-[11px] font-medium text-[#B7C0CE] truncate max-w-[220px] text-center">
                  {meta?.title || 'Aura Screen Studio'}
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[9px] font-mono text-[#78A5FF] bg-[#1A2A47] px-1.5 py-0.5 rounded border border-[#78A5FF]/30 font-semibold">
                    {meta?.resolution || 'HD'}
                  </span>
                </div>
              </div>
            )}

            {/* Video Viewport with Smooth Cinematic Zoom & Pan */}
            <div className="relative w-full flex-1 bg-black overflow-hidden flex items-center justify-center group shrink-0">
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
                  style={{
                    transform: `scale(${zoomScale})`,
                    transformOrigin: getZoomOrigin(zoomFocus),
                    transition: 'transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)'
                  }}
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
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity z-20">
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

                <div className="flex items-center justify-between flex-wrap gap-2">
                  {/* Left Controls: Play / Pause / Time */}
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

                  {/* Center Controls: Studio Voice & Snapshot */}
                  <div className="flex items-center space-x-2">
                    {/* Studio Voice Enhancer */}
                    <button
                      onClick={toggleStudioVoice}
                      title={
                        isStudioVoice
                          ? 'Voz de Estúdio Ativa: Presença Vocal (+3.5 dB) e De-Esser (Ctrl+E)'
                          : 'Ativar Voz de Estúdio Descript: Áudio com Presença Vocal e Sem Sibilância (Ctrl+E)'
                      }
                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        isStudioVoice
                          ? 'bg-[#78A5FF] text-[#101A32] shadow-sm shadow-[#78A5FF]/40 font-bold'
                          : 'bg-[#191F2B]/90 hover:bg-[#222B39] text-[#B7C0CE] border border-[#303A4B]'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Voz de Estúdio</span>
                      {isStudioVoice && (
                        <span className="flex space-x-0.5 items-end h-2.5">
                          <span className="w-0.5 h-2 bg-[#101A32] animate-bounce" />
                          <span className="w-0.5 h-2.5 bg-[#101A32] animate-pulse" />
                          <span className="w-0.5 h-1.5 bg-[#101A32] animate-bounce" />
                        </span>
                      )}
                    </button>

                    {/* Instant Frame PNG Snapshot */}
                    <button
                      onClick={handleCaptureFrame}
                      title="Capturar Frame Atual como Imagem PNG em Alta Resolução (Tecla P)"
                      className="flex items-center space-x-1.5 bg-[#191F2B]/90 hover:bg-[#222B39] border border-[#303A4B] text-[#B7C0CE] hover:text-[#F3F5F9] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#78A5FF]" />
                      <span className="hidden md:inline">Frame PNG</span>
                    </button>
                  </div>

                  {/* Right Controls: Zoom, Speed, Volume & Fullscreen */}
                  <div className="flex items-center space-x-2.5">
                    {/* Zoom Level Selector */}
                    <div className="flex items-center bg-[#191F2B]/90 border border-[#303A4B] rounded-lg p-0.5" title="Zoom Cinematográfico (Tecla Z para alternar)">
                      {[1.0, 1.4, 1.8, 2.2].map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => {
                            setZoomScale(lvl);
                            showToast(`Zoom: ${lvl}x (Foco: ${zoomFocus})`, 'info');
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                            zoomScale === lvl
                              ? 'bg-[#78A5FF] text-[#101A32]'
                              : 'text-[#929CAF] hover:text-[#F3F5F9]'
                          }`}
                        >
                          {lvl}x
                        </button>
                      ))}
                    </div>

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
          </div>
        </div>

        {/* Canvas & Presentation Studio Controls */}
        {studioTab === 'canvas' && (
          <div className="w-full mt-4 bg-[#121722] border border-[#78A5FF] ring-2 ring-[#78A5FF]/30 rounded-2xl p-5 flex flex-col space-y-4 shadow-xl shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#303A4B]">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#191F2B] border border-[#303A4B] flex items-center justify-center shrink-0">
                  <Palette className="w-4 h-4 text-[#78A5FF]" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-[#F3F5F9]">Estúdio de Apresentação & Moldura Screen Studio</span>
                    <span className="text-[10px] bg-[#1A2A47] text-[#78A5FF] border border-[#78A5FF]/30 px-2 py-0.5 rounded-full font-bold">
                      Pro Presentation
                    </span>
                  </div>
                  <span className="text-[11px] text-[#929CAF]">
                    Personalize o plano de fundo, proporção e foco cinematográfico para compartilhar seu vídeo
                  </span>
                </div>
              </div>

              <button
                onClick={handleCaptureFrame}
                className="flex items-center space-x-1.5 bg-[#78A5FF] hover:bg-[#9AB9FF] active:scale-95 text-[#101A32] px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Copiar Frame PNG (P)</span>
              </button>
            </div>

            {/* Presets Grid & Aspect Ratio */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Wallpaper Presets */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#F3F5F9] flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#78A5FF]" />
                  <span>Plano de Fundo (Wallpapers Studio)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {BACKDROP_PRESETS.map((bp) => (
                    <button
                      key={bp.id}
                      onClick={() => setCanvasBackdrop(bp.id)}
                      className={`flex flex-col p-2.5 rounded-xl border text-left transition-all ${
                        canvasBackdrop === bp.id
                          ? 'border-[#78A5FF] bg-[#191F2B] shadow-md ring-1 ring-[#78A5FF]/50'
                          : 'border-[#303A4B] bg-[#0B0E14] hover:bg-[#191F2B]/60'
                      }`}
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                          style={{ backgroundColor: bp.dotColor }}
                        />
                        <span className="text-xs font-semibold text-[#F3F5F9] truncate">{bp.name}</span>
                      </div>
                      <span className="text-[10px] text-[#929CAF] line-clamp-1">{bp.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio & Frame Styling */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#F3F5F9] flex items-center space-x-1.5">
                  <LayoutTemplate className="w-3.5 h-3.5 text-[#78A5FF]" />
                  <span>Formato & Proporção de Exportação</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: '16-9', label: '16:9', desc: 'Widescreen', icon: Monitor },
                    { id: '9-16', label: '9:16', desc: 'Shorts/Reels', icon: Smartphone },
                    { id: '1-1', label: '1:1', desc: 'Quadrado', icon: Square },
                    { id: '4-3', label: '4:3', desc: 'Pitch Deck', icon: LayoutTemplate }
                  ].map((ratio) => {
                    const IconComp = ratio.icon;
                    return (
                      <button
                        key={ratio.id}
                        onClick={() => setAspectRatio(ratio.id as CanvasAspectRatio)}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all ${
                          aspectRatio === ratio.id
                            ? 'border-[#78A5FF] bg-[#191F2B] text-[#78A5FF] ring-1 ring-[#78A5FF]/50'
                            : 'border-[#303A4B] bg-[#0B0E14] text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]/60'
                        }`}
                      >
                        <IconComp className="w-4 h-4 mb-1" />
                        <span className="text-xs font-bold">{ratio.label}</span>
                        <span className="text-[9px] text-[#929CAF]">{ratio.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {/* macOS Titlebar Toggle & Frame Radius */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="flex items-center justify-between p-2.5 bg-[#191F2B] border border-[#303A4B] rounded-xl">
                    <span className="text-xs text-[#B7C0CE]">Barra macOS</span>
                    <button
                      onClick={() => setHasWindowHeader(!hasWindowHeader)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        hasWindowHeader
                          ? 'bg-[#78A5FF] text-[#101A32]'
                          : 'bg-[#222B39] text-[#929CAF]'
                      }`}
                    >
                      {hasWindowHeader ? 'Visível (🔴🟡🟢)' : 'Oculta'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-[#191F2B] border border-[#303A4B] rounded-xl">
                    <span className="text-xs text-[#B7C0CE]">Bordas</span>
                    <div className="flex space-x-1">
                      {[0, 12, 16, 24].map((rad) => (
                        <button
                          key={rad}
                          onClick={() => setFrameRadius(rad)}
                          className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-colors ${
                            frameRadius === rad
                              ? 'bg-[#78A5FF] text-[#101A32]'
                              : 'text-[#929CAF] hover:text-[#F3F5F9]'
                          }`}
                        >
                          {rad}px
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Smooth Zoom Focus Quadrant & Shadow Depth */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#303A4B]">
              {/* Cinematic Zoom Focus */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#F3F5F9] flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <ZoomIn className="w-3.5 h-3.5 text-[#78A5FF]" />
                    <span>Foco Cinematográfico (Screen Studio Pan)</span>
                  </span>
                  <span className="text-[10px] text-[#78A5FF] font-mono font-bold">
                    Escala: {zoomScale}x
                  </span>
                </label>
                <div className="flex items-center space-x-2">
                  <div className="grid grid-cols-3 gap-1.5 w-32 shrink-0">
                    {[
                      { id: 'top-left', label: 'TL' },
                      { id: 'center', label: 'Centro' },
                      { id: 'top-right', label: 'TR' },
                      { id: 'bottom-left', label: 'BL' },
                      { id: 'center', label: '●' },
                      { id: 'bottom-right', label: 'BR' }
                    ].map((pt, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setZoomFocus(pt.id as ZoomFocusPoint);
                          showToast(`Foco de zoom: ${pt.id}`, 'info');
                        }}
                        className={`py-1 rounded text-[10px] font-bold transition-all ${
                          zoomFocus === pt.id
                            ? 'bg-[#78A5FF] text-[#101A32]'
                            : 'bg-[#191F2B] border border-[#303A4B] text-[#929CAF] hover:text-[#F3F5F9]'
                        }`}
                      >
                        {pt.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <span className="text-[11px] text-[#929CAF] block">
                      Aproxime e centralize a região do vídeo com transições suaves cubic-bezier.
                    </span>
                    <div className="flex space-x-1.5">
                      {[1.0, 1.4, 1.8, 2.2].map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            setZoomScale(s);
                            showToast(`Zoom: ${s}x`, 'info');
                          }}
                          className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                            zoomScale === s
                              ? 'bg-[#78A5FF] text-[#101A32]'
                              : 'bg-[#191F2B] border border-[#303A4B] text-[#929CAF] hover:text-[#F3F5F9]'
                          }`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Shadow Depth */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#F3F5F9] flex items-center space-x-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#78A5FF]" />
                  <span>Profundidade de Sombra da Janela</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'none', label: 'Nenhuma' },
                    { id: 'subtle', label: 'Sutil 2D' },
                    { id: 'cinematic', label: '3D Studio' },
                    { id: 'glow', label: 'Aura Glow' }
                  ].map((sh) => (
                    <button
                      key={sh.id}
                      onClick={() => setFrameShadow(sh.id as FrameShadowStyle)}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        frameShadow === sh.id
                          ? 'border-[#78A5FF] bg-[#191F2B] text-[#78A5FF] font-bold ring-1 ring-[#78A5FF]/50'
                          : 'border-[#303A4B] bg-[#0B0E14] text-[#929CAF] hover:text-[#F3F5F9] hover:bg-[#191F2B]/60'
                      }`}
                    >
                      <span className="text-xs">{sh.label}</span>
                    </button>
                  ))}
                </div>
                <div className="p-2.5 bg-[#191F2B] rounded-xl border border-[#303A4B] flex items-center justify-between text-xs text-[#929CAF]">
                  <span>Espaçamento Interno (Padding)</span>
                  <div className="flex space-x-1">
                    {[0, 4, 6, 10].map((pad) => (
                      <button
                        key={pad}
                        onClick={() => setCanvasPadding(pad)}
                        className={`px-2 py-0.5 rounded text-xs font-mono font-bold transition-colors ${
                          canvasPadding === pad
                            ? 'bg-[#78A5FF] text-[#101A32]'
                            : 'text-[#929CAF] hover:text-[#F3F5F9]'
                        }`}
                      >
                        {pad * 2}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
                  className="w-20 bg-[#0B0E14] border border-[#303A4B] rounded px-1.5 py-0.5 text-[#F3F5F9] font-mono text-xs focus:border-[#78A5FF] outline-none text-center"
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
                  className="w-20 bg-[#0B0E14] border border-[#303A4B] rounded px-1.5 py-0.5 text-[#F3F5F9] font-mono text-xs focus:border-[#78A5FF] outline-none text-center"
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

      {/* Interactive Studio Shortcuts Cheat-Sheet Modal */}
      {isShortcutsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#121722] border border-[#78A5FF]/40 rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#303A4B]">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#191F2B] border border-[#303A4B] flex items-center justify-center text-[#78A5FF]">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#F3F5F9]">Atalhos de Teclado do Studio</h3>
                  <p className="text-[11px] text-[#929CAF]">Domine o player e os recursos avançados sem tirar as mãos do teclado</p>
                </div>
              </div>
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                className="text-[#929CAF] hover:text-[#F3F5F9] p-1.5 rounded-lg hover:bg-[#191F2B] transition-colors text-xs font-mono"
              >
                ESC
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs max-h-[60vh] overflow-y-auto pr-1">
              {/* Reprodução */}
              <div className="bg-[#191F2B] border border-[#303A4B] rounded-xl p-3 space-y-2">
                <span className="font-bold text-[#78A5FF] uppercase tracking-wider text-[10px] block">
                  ▶ Reprodução & Linha do Tempo
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Play / Pause</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">Espaço</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Silenciar / Ativar Áudio</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">M</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Buscar -5s / +5s</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">← / →</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Ajustar Volume</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">↑ / ↓</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Velocidades (1x, 1.25x, 1.5x, 2x)</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">1, 2, 3, 4</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Tela Cheia</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">F</kbd>
                  </div>
                </div>
              </div>

              {/* Corte & Precisão */}
              <div className="bg-[#191F2B] border border-[#303A4B] rounded-xl p-3 space-y-2">
                <span className="font-bold text-[#FF647C] uppercase tracking-wider text-[10px] block">
                  ✂ Estúdio de Corte
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Marcar Ponto Inicial</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">I</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Marcar Ponto Final</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">O</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Voltar / Avançar 1 Frame</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">, e .</kbd>
                  </div>
                </div>
              </div>

              {/* Canvas & Studio */}
              <div className="bg-[#191F2B] border border-[#303A4B] rounded-xl p-3 space-y-2">
                <span className="font-bold text-[#83B8FF] uppercase tracking-wider text-[10px] block">
                  🎨 Canvas & Zoom Cinematográfico
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Alternar Zoom (1x a 2.2x)</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">Z</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Capturar Frame PNG</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">P</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Voz de Estúdio DSP</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">Ctrl + E</kbd>
                  </div>
                </div>
              </div>

              {/* Compartilhamento & Ações */}
              <div className="bg-[#191F2B] border border-[#303A4B] rounded-xl p-3 space-y-2">
                <span className="font-bold text-[#F2B66D] uppercase tracking-wider text-[10px] block">
                  ⚡ Compartilhamento & Atalhos
                </span>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Copiar Link Público</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">Ctrl + L</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Abrir Este Guia</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">?</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#B7C0CE]">Fechar Diálogo</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-[#0B0E14] border border-[#303A4B] font-mono text-[10px] text-[#F3F5F9]">Esc</kbd>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                className="py-1.5 px-4 bg-[#78A5FF] hover:bg-[#9AB9FF] text-[#101A32] text-xs font-bold rounded-xl transition-colors shadow-sm"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

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
