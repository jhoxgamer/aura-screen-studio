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
  const [isMirrored, setIsMirrored] = useState<boolean>(() => {
    const saved = localStorage.getItem('aura_bubble_mirrored');
    return saved !== null ? saved === 'true' : true;
  });
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [cameraFilter, setCameraFilter] = useState<'none' | 'blur' | 'studio' | 'vibrant'>(() => {
    return (localStorage.getItem('aura_bubble_filter') as any) || 'none';
  });
  const [bubbleShape, setBubbleShape] = useState<'circle' | 'squircle'>(() => {
    return (localStorage.getItem('aura_bubble_shape') as any) || 'circle';
  });
  const [filterToast, setFilterToast] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  useEffect(() => {
    localStorage.setItem('aura_bubble_mirrored', String(isMirrored));
  }, [isMirrored]);

  useEffect(() => {
    localStorage.setItem('aura_bubble_filter', cameraFilter);
  }, [cameraFilter]);

  useEffect(() => {
    localStorage.setItem('aura_bubble_shape', bubbleShape);
  }, [bubbleShape]);

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

  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showBubbleToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setFilterToast(msg);
    toastTimeoutRef.current = setTimeout(() => setFilterToast(null), 1800);
  };

  const handleSizeChange = (newSize: BubbleSize, showToast = false) => {
    setSize(newSize);
    window.electronAPI.setBubbleSize(newSize);
    if (showToast) {
      const labels: Record<BubbleSize, string> = {
        small: 'Tamanho: Pequeno (1)',
        medium: 'Tamanho: Médio (2)',
        large: 'Tamanho: Grande (3)',
        fullscreen: 'Tela Inteira'
      };
      showBubbleToast(labels[newSize]);
    }
  };

  const toggleCamera = () => {
    setIsCameraActive(prev => {
      const nextState = !prev;
      if (streamRef.current) {
        streamRef.current.getVideoTracks().forEach((track) => {
          track.enabled = nextState;
        });
      }
      showBubbleToast(nextState ? 'Câmera Ativada (V)' : 'Câmera Oculta (V)');
      return nextState;
    });
  };

  const cycleFilter = () => {
    const filters: Array<'none' | 'blur' | 'studio' | 'vibrant'> = ['none', 'blur', 'studio', 'vibrant'];
    setCameraFilter(prev => {
      const next = filters[(filters.indexOf(prev) + 1) % filters.length];
      const names: Record<string, string> = {
        none: 'Filtro: Natural',
        blur: 'Filtro: Bokeh Blur',
        studio: 'Filtro: Studio Light',
        vibrant: 'Filtro: Vibrante'
      };
      showBubbleToast(names[next] || next);
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === '1') {
        handleSizeChange('small', true);
      } else if (key === '2') {
        handleSizeChange('medium', true);
      } else if (key === '3') {
        handleSizeChange('large', true);
      } else if (key === 'm') {
        setIsMirrored(prev => {
          const next = !prev;
          showBubbleToast(next ? 'Espelhado (M)' : 'Normal (M)');
          return next;
        });
      } else if (key === 's') {
        setBubbleShape(prev => {
          const next = prev === 'circle' ? 'squircle' : 'circle';
          showBubbleToast(next === 'circle' ? 'Formato: Círculo (S)' : 'Formato: Squircle (S)');
          return next;
        });
      } else if (key === 'f') {
        cycleFilter();
      } else if (key === 'v') {
        toggleCamera();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Dynamic audio-reactive ring glow scale
  const ringScale = 1 + (audioLevel > 0.05 ? audioLevel * 0.08 : 0);
  const ringGlow = audioLevel > 0.08
    ? `0 0 ${10 + audioLevel * 18}px rgba(120, 165, 255, ${0.4 + audioLevel * 0.4})`
    : '0 0 12px rgba(120, 165, 255, 0.2)';

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
            border: `2px solid rgba(120, 165, 255, ${0.35 + audioLevel * 0.5})`
          }}
        />

        {/* Bubble Outer Frame with Clean Border */}
        <div
          onDoubleClick={() => {
            const nextSize = size === 'small' ? 'medium' : size === 'medium' ? 'large' : 'small';
            handleSizeChange(nextSize);
          }}
          className={`relative w-full h-full overflow-hidden transition-all duration-300 ring-2 ring-[#78A5FF]/80 border border-[#303A4B] shadow-2xl ${
            bubbleShape === 'circle' ? 'rounded-full' : 'rounded-[38px]'
          }`}
        >
          {/* Active Camera Stream */}
          {isCameraActive ? (
            <div className="relative w-full h-full">
              {cameraFilter === 'blur' && (
                <div className={`absolute inset-0 bg-[#78A5FF]/10 backdrop-blur-xl pointer-events-none ${
                  bubbleShape === 'circle' ? 'rounded-full' : 'rounded-[38px]'
                }`} />
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
            <div className="w-full h-full bg-[#0B0E14] flex flex-col items-center justify-center text-[#929CAF] relative overflow-hidden">
              {/* Voice pulse ring behind avatar */}
              <div
                className="absolute rounded-full bg-[#78A5FF]/20 transition-transform duration-100 pointer-events-none"
                style={{
                  width: '90px',
                  height: '90px',
                  transform: `scale(${1 + audioLevel * 0.5})`,
                  opacity: 0.3 + audioLevel * 0.6
                }}
              />
              <div className="w-20 h-20 rounded-full bg-[#121722] border border-[#78A5FF]/40 flex items-center justify-center shadow-inner z-10">
                <User className="w-10 h-10 text-[#78A5FF]" />
              </div>
              <span className="text-[11px] font-semibold text-[#B7C0CE] mt-2 z-10 flex items-center gap-1">
                {audioLevel > 0.08 && <Volume2 className="w-3 h-3 text-[#78A5FF]" />}
                {audioLevel > 0.08 ? 'Falando...' : 'Câmera Pausada'}
              </span>
            </div>
          )}

          {/* Active Recording Pulsing Ring Indicator */}
          <div className={`absolute inset-0 border border-[#FF647C]/70 pointer-events-none ${
            bubbleShape === 'circle' ? 'rounded-full' : 'rounded-[38px]'
          }`} />

          {/* Filter change toast */}
          {filterToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#121722]/95 backdrop-blur-md px-3 py-1 rounded-full border border-[#78A5FF]/40 text-[10px] font-bold text-[#78A5FF] tracking-wide uppercase shadow-lg z-20">
              {filterToast}
            </div>
          )}
        </div>

        {/* Hover Action Overlay & Controls */}
        <div
          className={`absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center space-x-1 px-3 py-1.5 rounded-full bg-[#0B0E14]/95 backdrop-blur-xl border border-[#303A4B] shadow-2xl transition-all duration-200 z-30 ${
            showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* Bubble Size buttons */}
          <button
            onClick={() => handleSizeChange('small', true)}
            title="Tamanho Pequeno (Tecla 1)"
            className={`w-6 h-6 rounded-full text-xs font-bold transition-all flex items-center justify-center ${
              size === 'small' ? 'bg-[#78A5FF] text-[#101A32] shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9]'
            }`}
          >
            P
          </button>

          <button
            onClick={() => handleSizeChange('medium', true)}
            title="Tamanho Médio (Tecla 2)"
            className={`w-6 h-6 rounded-full text-xs font-bold transition-all flex items-center justify-center ${
              size === 'medium' ? 'bg-[#78A5FF] text-[#101A32] shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9]'
            }`}
          >
            M
          </button>

          <button
            onClick={() => handleSizeChange('large', true)}
            title="Tamanho Grande (Tecla 3)"
            className={`w-6 h-6 rounded-full text-xs font-bold transition-all flex items-center justify-center ${
              size === 'large' ? 'bg-[#78A5FF] text-[#101A32] shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9]'
            }`}
          >
            G
          </button>

          <div className="w-px h-3.5 bg-[#303A4B] mx-1" />

          {/* Flip Horizontal (Mirror) */}
          <button
            onClick={() => {
              setIsMirrored(!isMirrored);
              showBubbleToast(!isMirrored ? 'Espelhado (M)' : 'Normal (M)');
            }}
            title="Espelhar Câmera (Tecla M)"
            className={`p-1.5 rounded-full transition-colors ${
              isMirrored ? 'text-[#78A5FF] bg-[#1A2A47]' : 'text-[#929CAF] hover:text-[#F3F5F9]'
            }`}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* Camera toggle */}
          <button
            onClick={toggleCamera}
            title={isCameraActive ? 'Desativar Câmera (Tecla V)' : 'Ativar Câmera (Tecla V)'}
            className="p-1.5 rounded-full text-[#929CAF] hover:text-[#F3F5F9] transition-colors"
          >
            {isCameraActive ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5 text-[#FF647C]" />}
          </button>

          {/* Shape Toggle (Circle vs Squircle) */}
          <button
            onClick={() => {
              const next = bubbleShape === 'circle' ? 'squircle' : 'circle';
              setBubbleShape(next);
              showBubbleToast(next === 'circle' ? 'Formato: Círculo (S)' : 'Formato: Squircle (S)');
            }}
            title={bubbleShape === 'circle' ? 'Mudar para Squircle (Tecla S)' : 'Mudar para Círculo (Tecla S)'}
            className="p-1.5 rounded-full text-[#929CAF] hover:text-[#78A5FF] transition-colors"
          >
            {bubbleShape === 'circle' ? <Square className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
          </button>

          {/* Camera Filter / Studio Lighting toggle */}
          <button
            onClick={cycleFilter}
            title={`Filtro: ${cameraFilter.toUpperCase()} (Tecla F)`}
            className={`p-1.5 rounded-full transition-colors ${
              cameraFilter !== 'none' ? 'bg-[#78A5FF] text-[#101A32] font-bold shadow-sm' : 'text-[#929CAF] hover:text-[#F3F5F9]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#78A5FF]" />
          </button>
        </div>
      </div>
    </div>
  );
};
