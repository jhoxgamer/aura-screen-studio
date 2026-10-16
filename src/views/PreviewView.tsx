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
  ArrowLeft
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { RecordingMeta } from '../types';

export const PreviewView: React.FC = () => {
  const [meta, setMeta] = useState<RecordingMeta | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Trimming states
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isTrimming, setIsTrimming] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Launch celebratory confetti effect on finishing video
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {}

    const cleanup = window.electronAPI.onOpenPreview((receivedMeta) => {
      setMeta(receivedMeta);
    });

    return cleanup;
  }, []);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setTrimEnd(dur);
    }
  };

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

  const handleCopyPath = () => {
    if (meta?.filePath) {
      navigator.clipboard.writeText(meta.filePath);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleOpenFolder = () => {
    if (meta?.filePath) {
      window.electronAPI.openFileFolder(meta.filePath);
    }
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

  return (
    <div className="w-full h-full min-h-screen bg-loom-dark text-white flex flex-col select-none overflow-hidden">
      {/* Top Header */}
      <div className="h-14 bg-loom-panel border-b border-loom-border px-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-lg bg-loom-primary flex items-center justify-center shadow-md">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">
              {meta?.title || 'Gravação Concluída'}
            </h1>
            <span className="text-[11px] text-loom-muted">
              {meta ? `${formatFileSize(meta.fileSize)} • ${meta.resolution} • ${new Date(meta.createdAt).toLocaleTimeString('pt-BR')}` : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Open Folder */}
          <button
            onClick={handleOpenFolder}
            className="flex items-center space-x-1.5 bg-loom-card hover:bg-loom-hover border border-loom-border px-3 py-1.5 rounded-xl text-xs font-medium text-white transition-all shadow-sm"
          >
            <FolderOpen className="w-3.5 h-3.5 text-loom-secondary" />
            <span>Abrir Pasta</span>
          </button>

          {/* Copy path */}
          <button
            onClick={handleCopyPath}
            className="flex items-center space-x-1.5 bg-loom-card hover:bg-loom-hover border border-loom-border px-3 py-1.5 rounded-xl text-xs font-medium text-white transition-all shadow-sm"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-loom-accent" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{isCopied ? 'Copiado!' : 'Copiar Caminho'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Video Player & Editor */}
      <div className="flex-1 flex flex-col p-6 items-center justify-center max-w-5xl mx-auto w-full">
        {/* Video Player Container */}
        <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-loom-border shadow-2xl flex items-center justify-center group">
          {meta?.filePath ? (
            <video
              ref={videoRef}
              src={`file://${meta.filePath}`}
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
                className="w-full h-1.5 bg-white/20 accent-loom-coral rounded-lg cursor-pointer appearance-none"
              />
            </div>

            <div className="flex items-center justify-between">
              {/* Play / Pause / Time */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={togglePlay}
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
                  className="text-xs font-bold bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg text-white transition-colors"
                >
                  {playbackRate}x
                </button>

                {/* Mute Button */}
                <button
                  onClick={toggleMute}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-loom-coral" /> : <Volume2 className="w-4 h-4" />}
                </button>

                {/* Fullscreen */}
                <button
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.requestFullscreen();
                    }
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
                >
                  <Maximize className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Trimming & Video Editing Section */}
        <div className="w-full mt-4 bg-loom-panel border border-loom-border rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Scissors className="w-4 h-4 text-loom-primary" />
            <span className="text-xs font-semibold text-white">Ajustar e Cortar Vídeo (Trimming)</span>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs">
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
                className="w-16 bg-loom-card border border-loom-border rounded px-2 py-1 text-white font-mono"
              />
              <span className="text-loom-muted">s</span>
            </div>

            <div className="flex items-center space-x-2 text-xs">
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
                className="w-16 bg-loom-card border border-loom-border rounded px-2 py-1 text-white font-mono"
              />
              <span className="text-loom-muted">s</span>
            </div>

            <button
              onClick={() => setIsTrimming(!isTrimming)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                isTrimming
                  ? 'bg-loom-coral text-white shadow-sm'
                  : 'bg-loom-card border border-loom-border text-loom-muted hover:text-white'
              }`}
            >
              {isTrimming ? 'Modo Corte Ativo' : 'Ativar Prévia de Corte'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
