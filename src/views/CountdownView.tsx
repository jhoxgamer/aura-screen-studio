import React, { useState, useEffect } from 'react';

export const CountdownView: React.FC = () => {
  const [count, setCount] = useState<number>(3);

  useEffect(() => {
    const cleanup = window.electronAPI.onCountdownTick((newCount) => {
      setCount(newCount);
    });
    return cleanup;
  }, []);

  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  // Progress ratio (3 -> 100%, 2 -> 66%, 1 -> 33%, 0 -> 0%)
  const progressRatio = Math.max(0, count) / 3;
  const strokeDashoffset = circumference - progressRatio * circumference;

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-black/50 backdrop-blur-md select-none overflow-hidden">
      <div className="relative flex items-center justify-center">
        {/* Soft Radial Ambient Aura Glow */}
        <div className="w-72 h-72 rounded-full bg-cyan-500/20 blur-3xl absolute animate-pulse" />
        <div className="w-56 h-56 rounded-full bg-indigo-600/25 blur-2xl absolute" />

        {/* Circular SVG Countdown Ring */}
        <svg className="w-56 h-56 -rotate-90 transform" viewBox="0 0 200 200">
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="8"
          />
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="transparent"
            stroke="url(#auraCountdownGrad)"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
          <defs>
            <linearGradient id="auraCountdownGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center Circular Card */}
        <div className="w-40 h-40 rounded-full bg-[#0b0e17]/95 border border-cyan-500/40 shadow-2xl shadow-cyan-500/20 flex flex-col items-center justify-center absolute">
          <span className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-cyan-300 to-indigo-400 transform scale-105 transition-transform duration-200">
            {count > 0 ? count : 'GO!'}
          </span>
          <div className="flex items-center space-x-1 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
            <span className="text-[10px] font-extrabold tracking-widest uppercase text-slate-300">
              AURA REC
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
