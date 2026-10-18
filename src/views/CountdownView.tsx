import React, { useState, useEffect } from 'react';

export function playCountdownChime(count: number) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const isStart = count === 0;
    const freq = isStart ? 880 : 440;
    const duration = isStart ? 0.16 : 0.08;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.02);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, (duration + 0.1) * 1000);
  } catch (e) {
    // Non-blocking fallback for restricted contexts
  }
}

export const CountdownView: React.FC = () => {
  const [count, setCount] = useState<number>(3);
  const [totalCount, setTotalCount] = useState<number>(3);

  useEffect(() => {
    const cleanupInit = window.electronAPI.onCountdownInit?.((data) => {
      if (data?.total) {
        setTotalCount(data.total);
        setCount(data.current);
      }
    });

    const cleanupTick = window.electronAPI.onCountdownTick((newCount) => {
      setCount(newCount);
      playCountdownChime(newCount);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electronAPI?.cancelRecording?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      cleanupInit?.();
      cleanupTick();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  // Progress ratio dynamically scaled to initial total count
  const progressRatio = Math.max(0, count) / (totalCount || 3);
  const strokeDashoffset = circumference - progressRatio * circumference;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-black/60 backdrop-blur-md select-none overflow-hidden font-sans">
      <div className="relative flex items-center justify-center">
        {/* Circular SVG Countdown Ring */}
        <svg className="w-56 h-56 -rotate-90 transform" viewBox="0 0 200 200">
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="6"
          />
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="transparent"
            stroke={count === 0 ? '#FF647C' : '#78A5FF'}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center Circular Card */}
        <div className="w-40 h-40 rounded-full bg-[#121722] border border-[#222B39] shadow-2xl flex flex-col items-center justify-center absolute">
          {count > 0 ? (
            <span className="text-6xl font-black font-mono text-white tracking-tight drop-shadow-lg animate-in zoom-in-75 duration-200">
              {count}
            </span>
          ) : (
            <div className="flex flex-col items-center space-y-1 animate-pulse">
              <span className="text-xs font-black font-mono text-[#FF647C] tracking-widest uppercase bg-[#FF647C]/10 border border-[#FF647C]/30 px-3 py-1 rounded-full">
                GRAVANDO
              </span>
            </div>
          )}
          <div className="flex items-center space-x-1.5 mt-2">
            <span className={`w-2 h-2 rounded-full inline-block ${count === 0 ? 'bg-[#FF647C] animate-ping' : 'bg-[#78A5FF]'}`} />
            <span className="text-[10px] font-medium tracking-widest uppercase text-slate-400">
              Aura Studio
            </span>
          </div>
        </div>
      </div>

      {/* ESC Cancel Hint Pill */}
      {count > 0 && (
        <div className="mt-5 px-3 py-1 rounded-full bg-[#121722]/90 border border-[#222B39] text-[10px] font-mono text-slate-400 flex items-center space-x-1.5 shadow-lg backdrop-blur-md animate-in fade-in duration-300">
          <span className="text-[#78A5FF] font-bold">[ESC]</span>
          <span>Cancelar</span>
        </div>
      )}
    </div>
  );
};

