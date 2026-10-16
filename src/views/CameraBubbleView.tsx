import React, { useState, useEffect, useRef } from 'react';
import {
  Maximize2,
  Minimize2,
  FlipHorizontal,
  Video,
  VideoOff,
  Mic,
  MicOff,
  User,
  Sparkles,
  Move
} from 'lucide-react';
import { BubbleSize, RecordingOptions } from '../types';

export const CameraBubbleView: React.FC = () => {
  const [size, setSize] = useState<BubbleSize>('medium');
  const [isMirrored, setIsMirrored] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [borderStyle, setBorderStyle] = useState<'default' | 'glow' | 'coral' | 'gradient'>('default');
  const [cameraFilter, setCameraFilter] = useState<'none' | 'blur' | 'studio' | 'vibrant'>('none');

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

  const toggleMute = () => {
    setIsMuted(!isMuted);
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
        {/* Circular Bubble Outer Frame */}
        <div
          className={`relative w-full h-full rounded-full overflow-hidden transition-all duration-300 ${
            borderStyle === 'glow'
              ? 'ring-4 ring-loom-primary shadow-bubble'
              : borderStyle === 'coral'
              ? 'ring-4 ring-loom-coral shadow-bubble-active'
              : borderStyle === 'gradient'
              ? 'ring-4 ring-gradient-to-r from-loom-primary to-loom-coral shadow-bubble'
              : 'ring-4 ring-white/20 shadow-bubble'
          }`}
        >
          {/* Active Camera Stream */}
          {isCameraActive ? (
            <div className="relative w-full h-full">
              {cameraFilter === 'blur' && (
                <div className="absolute inset-0 bg-loom-primary/20 backdrop-blur-xl pointer-events-none rounded-full" />
              )}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  filter: cameraFilter === 'blur'
                    ? 'contrast(1.08) brightness(1.05) saturate(1.15)'
                    : cameraFilter === 'studio'
                    ? 'brightness(1.12) contrast(1.12)'
                    : cameraFilter === 'vibrant'
                    ? 'saturate(1.35) contrast(1.08)'
                    : 'none'
                }}
                className={`w-full h-full object-cover transition-all duration-200 ${
                  isMirrored ? 'scale-x-[-1]' : ''
                }`}
              />
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-loom-dark via-loom-panel to-loom-card flex flex-col items-center justify-center text-loom-muted">
              <div className="w-20 h-20 rounded-full bg-loom-panel border border-loom-border flex items-center justify-center shadow-inner">
                <User className="w-10 h-10 text-loom-primary" />
              </div>
              <span className="text-[11px] font-semibold text-white/80 mt-2">Câmera Pausada</span>
            </div>
          )}

          {/* Active Recording Pulsing Ring Indicator */}
          <div className="absolute inset-0 rounded-full border-2 border-loom-coral/60 pointer-events-none animate-pulse" />
        </div>

        {/* Hover Action Overlay & Controls */}
        <div
          className={`absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-loom-dark/90 backdrop-blur-md border border-loom-border shadow-2xl transition-all duration-200 ${
            showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* Bubble Size buttons */}
          <button
            onClick={() => handleSizeChange('small')}
            title="Bolha Pequena"
            className={`p-1.5 rounded-full text-xs font-bold transition-colors ${
              size === 'small' ? 'bg-loom-primary text-white' : 'text-loom-muted hover:text-white'
            }`}
          >
            P
          </button>

          <button
            onClick={() => handleSizeChange('medium')}
            title="Bolha Média"
            className={`p-1.5 rounded-full text-xs font-bold transition-colors ${
              size === 'medium' ? 'bg-loom-primary text-white' : 'text-loom-muted hover:text-white'
            }`}
          >
            M
          </button>

          <button
            onClick={() => handleSizeChange('large')}
            title="Bolha Grande"
            className={`p-1.5 rounded-full text-xs font-bold transition-colors ${
              size === 'large' ? 'bg-loom-primary text-white' : 'text-loom-muted hover:text-white'
            }`}
          >
            G
          </button>

          <div className="w-px h-3.5 bg-loom-border mx-0.5" />

          {/* Flip Horizontal (Mirror) */}
          <button
            onClick={() => setIsMirrored(!isMirrored)}
            title="Espelhar Câmera"
            className={`p-1.5 rounded-full transition-colors ${
              isMirrored ? 'text-loom-primary bg-loom-primary/20' : 'text-loom-muted hover:text-white'
            }`}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* Camera toggle */}
          <button
            onClick={toggleCamera}
            title={isCameraActive ? 'Desativar Câmera' : 'Ativar Câmera'}
            className="p-1.5 rounded-full text-loom-muted hover:text-white transition-colors"
          >
            {isCameraActive ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5 text-loom-coral" />}
          </button>

          {/* Camera Filter / Blur toggle */}
          <button
            onClick={() => {
              const filters: Array<'none' | 'blur' | 'studio' | 'vibrant'> = ['none', 'blur', 'studio', 'vibrant'];
              const next = filters[(filters.indexOf(cameraFilter) + 1) % filters.length];
              setCameraFilter(next);
            }}
            title={`Filtro: ${cameraFilter.toUpperCase()}`}
            className={`p-1.5 rounded-full transition-colors ${
              cameraFilter !== 'none' ? 'bg-loom-coral text-white font-bold' : 'text-loom-muted hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
