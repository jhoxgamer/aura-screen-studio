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
    <div className="w-screen h-screen flex items-center justify-center bg-black/60 backdrop-blur-md select-none overflow-hidden font-sans">
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
            stroke="#6366f1"
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center Circular Card */}
        <div className="w-40 h-40 rounded-full bg-[#0e111a] border border-[#232838] shadow-2xl flex flex-col items-center justify-center absolute">
          <span className="text-6xl font-bold font-mono text-white">
            {count > 0 ? count : 'GRAVANDO'}
          </span>
          <div className="flex items-center space-x-1.5 mt-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
            <span className="text-[10px] font-medium tracking-widest uppercase text-slate-400">
              Aura Studio
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
