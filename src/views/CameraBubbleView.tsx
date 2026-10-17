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
  Square,
  Volume2,
  Sliders
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
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Listen for size updates from main process
    const cleanupSize = window.electronAPI.onBubbleSizeChanged((newSize) => {
      setSize(newSize);
    });

    const cleanupOptions = window.electronAPI.onRecordingOptions((options: RecordingOptions) => {
      startCamera(options.videoDeviceId);
      startMicListener(options.audioDeviceId);
    });

    // Start with default camera & mic initially
    startCamera();
    startMicListener();

    return () => {
      cleanupSize();
      cleanupOptions();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      audioContextRef.current?.close().catch(() => {});
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

  // Real-time audio reactivity to pulse the glowing ring when speaking
  async function startMicListener(audioDeviceId?: string) {
    try {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
        video: false
      });

      micStreamRef.current = micStream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioCtx.createMediaStreamSource(micStream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(1, avg / 110);
        setAudioLevel(normalized);

        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      // Audio reactivity is optional enhancement
      console.warn('Bubble mic reactivity unavailable:', e);
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

  // Dynamic audio-reactive ring glow scale
  const ringScale = 1 + (audioLevel > 0.05 ? audioLevel * 0.08 : 0);
  const ringGlow = audioLevel > 0.08
    ? `0 0 ${10 + audioLevel * 18}px rgba(99, 102, 241, ${0.4 + audioLevel * 0.4})`
    : '0 0 12px rgba(99, 102, 241, 0.2)';

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
        {/* Audio Reactive Expanding Aura Ring */}
        <div
          className={`absolute inset-0 transition-transform duration-100 pointer-events-none ${
            bubbleShape === 'circle' ? 'rounded-full' : 'rounded-[38px]'
          }`}
          style={{
            transform: `scale(${ringScale})`,
            boxShadow: ringGlow,
            border: `2px solid rgba(99, 102, 241, ${0.35 + audioLevel * 0.5})`
          }}
        />

        {/* Bubble Outer Frame with Clean Border */}
        <div
          className={`relative w-full h-full overflow-hidden transition-all duration-300 ring-2 ring-indigo-500/80 border border-[#232838] shadow-2xl ${
            bubbleShape === 'circle' ? 'rounded-full' : 'rounded-[38px]'
          }`}
        >
          {/* Active Camera Stream */}
          {isCameraActive ? (
            <div className="relative w-full h-full">
              {cameraFilter === 'blur' && (
                <div className="absolute inset-0 bg-indigo-500/10 backdrop-blur-xl pointer-events-none rounded-full" />
              )}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  transform: isMirrored ? 'scaleX(-1) translateZ(0)' : 'translateZ(0)',
                  willChange: 'transform',
                  filter: cameraFilter === 'blur'
                    ? 'contrast(1.08) brightness(1.04) saturate(1.1)'
                    : cameraFilter === 'studio'
                    ? 'brightness(1.15) contrast(1.1) saturate(1.05)'
                    : cameraFilter === 'vibrant'
                    ? 'saturate(1.3) contrast(1.1)'
                    : 'none'
                }}
                className="w-full h-full object-cover transition-all duration-200"
              />
            </div>
          ) : (
            /* Avatar mode with audio voice pulse */
            <div className="w-full h-full bg-[#0a0d15] flex flex-col items-center justify-center text-slate-400 relative overflow-hidden">
              {/* Voice pulse ring behind avatar */}
              <div
                className="absolute rounded-full bg-indigo-500/20 transition-transform duration-100 pointer-events-none"
                style={{
                  width: '90px',
                  height: '90px',
                  transform: `scale(${1 + audioLevel * 0.5})`,
                  opacity: 0.3 + audioLevel * 0.6
                }}
              />
              <div className="w-20 h-20 rounded-full bg-[#121622] border border-indigo-500/40 flex items-center justify-center shadow-inner z-10">
                <User className="w-10 h-10 text-indigo-400" />
              </div>
              <span className="text-[11px] font-medium text-slate-300 mt-2 z-10 flex items-center gap-1">
                {audioLevel > 0.08 && <Volume2 className="w-3 h-3 text-indigo-400" />}
                {audioLevel > 0.08 ? 'Falando...' : 'Câmera Pausada'}
              </span>
            </div>
          )}

          {/* Active Recording Pulsing Ring Indicator */}
          <div className="absolute inset-0 rounded-full border border-rose-500/60 pointer-events-none" />

          {/* Filter change toast */}
          {filterToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-md px-3 py-1 rounded-full border border-indigo-500/40 text-[10px] font-semibold text-indigo-200 tracking-wide uppercase shadow-lg z-20">
              {filterToast}
            </div>
          )}
        </div>

        {/* Hover Action Overlay & Controls */}
        <div
          className={`absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center space-x-1 px-3 py-1.5 rounded-full bg-[#0d1018]/95 backdrop-blur-xl border border-[#252b3d] shadow-2xl transition-all duration-200 z-30 ${
            showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* Bubble Size buttons */}
          <button
            onClick={() => handleSizeChange('small')}
            title="Tamanho Pequeno (P)"
            className={`w-6 h-6 rounded-full text-xs font-semibold transition-all flex items-center justify-center ${
              size === 'small' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            P
          </button>

          <button
            onClick={() => handleSizeChange('medium')}
            title="Tamanho Médio (M)"
            className={`w-6 h-6 rounded-full text-xs font-semibold transition-all flex items-center justify-center ${
              size === 'medium' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            M
          </button>

          <button
            onClick={() => handleSizeChange('large')}
            title="Tamanho Grande (G)"
            className={`w-6 h-6 rounded-full text-xs font-semibold transition-all flex items-center justify-center ${
              size === 'large' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
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
              isMirrored ? 'text-indigo-400 bg-indigo-500/20' : 'text-slate-400 hover:text-white'
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

          {/* Camera Filter / Studio Lighting toggle */}
          <button
            onClick={cycleFilter}
            title={`Filtro: ${cameraFilter.toUpperCase()}`}
            className={`p-1.5 rounded-full transition-colors ${
              cameraFilter !== 'none' ? 'bg-indigo-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
          </button>
        </div>
      </div>
    </div>
  );
};
