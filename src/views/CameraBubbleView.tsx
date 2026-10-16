import React, { useState, useEffect, useRef } from 'react';
import {
  Maximize2,
  Minimize2,
  FlipHorizontal,
  Video,
  VideoOff,
  User,
  Sparkles,
  Circle,
  Square
} from 'lucide-react';
import { BubbleSize, RecordingOptions } from '../types';

export const CameraBubbleView: React.FC = () => {
  const [size, setSize] = useState<BubbleSize>('medium');
  const [isMirrored, setIsMirrored] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [cameraFilter, setCameraFilter] = useState<'none' | 'blur' | 'studio' | 'vibrant'>('none');
  const [bubbleShape, setBubbleShape] = useState<'circle' | 'squircle'>('circle');
  const [filterToast, setFilterToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Listen for size updates from main process
    const cleanupSize = window.electronAPI.onBubbleSizeChanged((newSize) => {
      setSize(newSize);
    });

    const cleanupOptions = window.electronAPI.onRecordingOptions((options: RecordingOptions) => {
      startCamera(options.videoDeviceId);
    });

    // Start with default camera initially
    startCamera();

    return () => {
      cleanupSize();
      cleanupOptions();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startCamera(deviceId?: string) {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn('Camera bubble failed to access video:', err);
    }
  }

  const handleSizeChange = (newSize: BubbleSize) => {
    setSize(newSize);
    window.electronAPI.setBubbleSize(newSize);
  };

  const toggleCamera = () => {
    const nextState = !isCameraActive;
    setIsCameraActive(nextState);
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = nextState;
      });
    }
  };

  const cycleFilter = () => {
    const filters: Array<'none' | 'blur' | 'studio' | 'vibrant'> = ['none', 'blur', 'studio', 'vibrant'];
    const next = filters[(filters.indexOf(cameraFilter) + 1) % filters.length];
    setCameraFilter(next);
    const names = { none: 'Natural', blur: 'Bokeh Blur', studio: 'Studio Light', vibrant: 'Vibrante' };
    setFilterToast(names[next]);
    setTimeout(() => setFilterToast(null), 1800);
  };

  return (
    <div
      className="w-screen h-screen flex items-center justify-center p-3 select-none"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Drag Container */}
      <div
        className="relative w-full h-full flex items-center justify-center group cursor-grab active:cursor-grabbing"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Bubble Outer Frame with Glowing Aura Border */}
        <div
          className={`relative w-full h-full overflow-hidden transition-all duration-300 ring-4 ring-cyan-500/70 shadow-2xl shadow-cyan-500/30 ${
            bubbleShape === 'circle' ? 'rounded-full' : 'rounded-3xl'
          }`}
        >
          {/* Active Camera Stream */}
          {isCameraActive ? (
            <div className="relative w-full h-full">
              {cameraFilter === 'blur' && (
                <div className="absolute inset-0 bg-cyan-500/10 backdrop-blur-xl pointer-events-none rounded-full" />
              )}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  filter: cameraFilter === 'blur'
                    ? 'contrast(1.1) brightness(1.05) saturate(1.15)'
                    : cameraFilter === 'studio'
                    ? 'brightness(1.15) contrast(1.12) saturate(1.05)'
                    : cameraFilter === 'vibrant'
                    ? 'saturate(1.4) contrast(1.1)'
                    : 'none'
                }}
                className={`w-full h-full object-cover transition-all duration-200 ${
                  isMirrored ? 'scale-x-[-1]' : ''
                }`}
              />
            </div>
          ) : (
            <div className="w-full h-full bg-[#0a0d15] flex flex-col items-center justify-center text-slate-400">
              <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center shadow-inner">
                <User className="w-10 h-10 text-cyan-400" />
              </div>
              <span className="text-[11px] font-bold text-slate-300 mt-2">Câmera Pausada</span>
            </div>
          )}

          {/* Active Recording Pulsing Ring Indicator */}
          <div className="absolute inset-0 rounded-full border-2 border-rose-500/60 pointer-events-none animate-pulse" />

          {/* Filter change toast */}
          {filterToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full border border-cyan-500/40 text-[10px] font-bold text-cyan-300 tracking-wide uppercase shadow-lg">
              {filterToast}
            </div>
          )}
        </div>

        {/* Hover Action Overlay & Controls */}
        <div
          className={`absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center space-x-1 px-3 py-1.5 rounded-full bg-[#0a0d15]/95 backdrop-blur-xl border border-cyan-500/30 shadow-2xl transition-all duration-200 ${
            showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* Bubble Size buttons */}
          <button
            onClick={() => handleSizeChange('small')}
            title="Tamanho Pequeno (P)"
            className={`w-6 h-6 rounded-full text-xs font-bold transition-all flex items-center justify-center ${
              size === 'small' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            P
          </button>

          <button
            onClick={() => handleSizeChange('medium')}
            title="Tamanho Médio (M)"
            className={`w-6 h-6 rounded-full text-xs font-bold transition-all flex items-center justify-center ${
              size === 'medium' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            M
          </button>

          <button
            onClick={() => handleSizeChange('large')}
            title="Tamanho Grande (G)"
            className={`w-6 h-6 rounded-full text-xs font-bold transition-all flex items-center justify-center ${
              size === 'large' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            G
          </button>

          <div className="w-px h-3.5 bg-slate-800 mx-1" />

          {/* Flip Horizontal (Mirror) */}
          <button
            onClick={() => setIsMirrored(!isMirrored)}
            title="Espelhar Câmera"
            className={`p-1.5 rounded-full transition-colors ${
              isMirrored ? 'text-cyan-400 bg-cyan-500/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* Camera toggle */}
          <button
            onClick={toggleCamera}
            title={isCameraActive ? 'Desativar Câmera' : 'Ativar Câmera'}
            className="p-1.5 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            {isCameraActive ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5 text-rose-400" />}
          </button>

          {/* Shape Toggle (Circle vs Squircle) */}
          <button
            onClick={() => setBubbleShape(bubbleShape === 'circle' ? 'squircle' : 'circle')}
            title={bubbleShape === 'circle' ? 'Mudar para Squircle' : 'Mudar para Círculo'}
            className="p-1.5 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            {bubbleShape === 'circle' ? <Square className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
          </button>

          {/* Camera Filter / Blur toggle */}
          <button
            onClick={cycleFilter}
            title={`Filtro: ${cameraFilter.toUpperCase()}`}
            className={`p-1.5 rounded-full transition-colors ${
              cameraFilter !== 'none' ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
          </button>
        </div>
      </div>
    </div>
  );
};
